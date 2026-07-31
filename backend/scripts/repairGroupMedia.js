/**
 * Sửa media của các NHÓM câu hỏi TOEIC (Part 3/4/6/7):
 *  1. Path ảnh trỏ file KHÔNG tồn tại → dò lại file thật cùng thư mục:
 *     a) cùng tên, khác đuôi (jpg↔png↔…);  b) suy từ số trong groupId (vd grp_131 → file chứa "-131-").
 *  2. Nhân audio/ảnh/passageCount/passages CHUNG (lấy từ câu có media trong nhóm) sang MỌI câu của nhóm.
 *
 * Chạy: node scripts/repairGroupMedia.js         (xem trước, KHÔNG ghi)
 *       node scripts/repairGroupMedia.js --apply  (ghi vào DB)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ToeicQuestion = require('../models/ToeicQuestion');

const PUB = path.join(__dirname, '..', 'public');
const IMG_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
const APPLY = process.argv.includes('--apply');

// Trả về URL ảnh đã sửa nếu tìm được file thật; null nếu chịu; nguyên bản nếu vốn đã đúng.
function resolveImage(url, groupId) {
    if (!url) return null;
    const rel = url.replace(/^\//, '');
    const abs = path.join(PUB, rel);
    if (fs.existsSync(abs)) return url; // đã đúng

    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const toUrl = (f) => '/' + path.relative(PUB, path.join(dir, f)).replace(/\\/g, '/');

    // (a) cùng tên, khác đuôi
    const base = path.basename(abs, path.extname(abs));
    let hit = files.find(f => IMG_EXT.test(f) && path.basename(f, path.extname(f)) === base);
    if (hit) return toUrl(hit);

    // (b) suy từ số trong groupId: pX_grp_131 → file chứa "-131-"
    const m = /(\d{2,3})/.exec(groupId || '');
    if (m) {
        hit = files.find(f => IMG_EXT.test(f) && f.includes(`-${m[1]}-`));
        if (hit) return toUrl(hit);
    }
    return null;
}

(async () => {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    const rows = await ToeicQuestion.find({ groupId: { $ne: null } })
        .select('questionNumber part groupId questionIndex audioUrl imageUrls passages passageCount').lean();

    // Gom theo groupId
    const groups = new Map();
    for (const r of rows) {
        if (!groups.has(r.groupId)) groups.set(r.groupId, []);
        groups.get(r.groupId).push(r);
    }

    let fixedImg = 0, propagated = 0, unresolved = 0;
    const ops = [];

    for (const [gid, members] of groups) {
        members.sort((a, b) => (a.questionIndex || 0) - (b.questionIndex || 0));

        // Media chung = giá trị đầu tiên không rỗng trong nhóm.
        let audioUrl = members.find(m => m.audioUrl)?.audioUrl || '';
        let passages = members.find(m => m.passages?.length)?.passages || [];
        let passageCount = members.find(m => m.passageCount)?.passageCount;
        let imageUrls = members.find(m => m.imageUrls?.length)?.imageUrls || [];

        // Sửa từng ảnh về file thật.
        const fixedImages = [];
        for (const u of imageUrls) {
            const r = resolveImage(u, gid);
            if (r && r !== u) { fixedImg++; console.log(`  [ảnh] ${gid}: ${u}  →  ${r}`); }
            if (!r) { unresolved++; console.log(`  [!!] ${gid}: KHÔNG dò được file cho ${u}`); fixedImages.push(u); }
            else fixedImages.push(r);
        }
        imageUrls = fixedImages;

        // Gắn media chung vào MỌI câu còn thiếu / khác.
        for (const m of members) {
            const set = {};
            if (audioUrl && m.audioUrl !== audioUrl) set.audioUrl = audioUrl;
            if (imageUrls.length && JSON.stringify(m.imageUrls || []) !== JSON.stringify(imageUrls)) set.imageUrls = imageUrls;
            if (passages.length && JSON.stringify(m.passages || []) !== JSON.stringify(passages)) set.passages = passages;
            if (passageCount && m.passageCount !== passageCount) set.passageCount = passageCount;
            if (Object.keys(set).length) {
                propagated++;
                ops.push({ updateOne: { filter: { _id: m._id }, update: { $set: set } } });
            }
        }
    }

    console.log(`\nNhóm: ${groups.size} | ảnh sửa path: ${fixedImg} | câu được gắn media: ${propagated} | ảnh chịu thua: ${unresolved}`);
    if (APPLY && ops.length) {
        const res = await ToeicQuestion.bulkWrite(ops);
        console.log(`✅ Đã ghi: ${res.modifiedCount} câu cập nhật.`);
    } else if (!APPLY) {
        console.log('（xem trước — thêm --apply để ghi vào DB）');
    }
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
