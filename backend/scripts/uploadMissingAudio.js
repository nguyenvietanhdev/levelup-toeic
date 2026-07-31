/**
 * Upload audio còn THIẾU cho các nhóm câu Listening (Part 1-4) lên Cloudinary
 * rồi GÁN `audioUrl` cho doc tương ứng. Khác uploadMissingImages ở chỗ audioUrl
 * hiện chưa có (không phải thay URL cũ) — script tự suy tên file theo số câu.
 *
 * Quy ước tên file (giống dữ liệu sẵn có):
 *   - nhóm nhiều câu (Part 3/4): `<source>-<câu đầu>-<câu cuối>.mp3`  vd ets26t1-71-73.mp3
 *   - câu đơn (Part 1):          `<source>-<số câu 2 chữ số>.mp3`      vd ets26t1-02.mp3
 * Thả file vào: backend/public/assets/audio/<source>/
 *
 *   node scripts/uploadMissingAudio.js [source]           # dry-run (mặc định ets26t1)
 *   node scripts/uploadMissingAudio.js [source] --apply    # upload + ghi DB
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Q = require('../models/ToeicQuestionSet');
const { cloudinary, isConfigured, uploadFile } = require('../utils/cloudinary');

const APPLY = process.argv.includes('--apply');
const SOURCE = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'ets26t1';
const PUB = path.join(__dirname, '..', 'public');
const LISTENING = [1, 2, 3, 4];

const expectedFilename = (source, nums) => {
    const first = nums[0], last = nums[nums.length - 1];
    return first === last
        ? `${source}-${String(first).padStart(2, '0')}.mp3`
        : `${source}-${first}-${last}.mp3`;
};

(async () => {
    if (!isConfigured()) { console.error('Cloudinary chưa cấu hình env — dừng.'); process.exit(1); }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`DB: ${mongoose.connection.name} | source: ${SOURCE} | mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

    const docs = await Q.find({ source: SOURCE, part: { $in: LISTENING } });
    // "Thiếu" = chưa có audioUrl HOẶC audioUrl còn trỏ đường đĩa local (chưa lên
    // cloud). Bản cloud thì bỏ qua (không đè).
    const missing = docs.filter(d => {
        const a = d.audioUrl;
        return !a || !String(a).trim() || a.includes('/assets/');
    });
    if (!missing.length) { console.log('Tất cả nhóm Listening đã có audio. Không cần làm gì.'); await mongoose.disconnect(); return; }

    let uploaded = 0; const noFile = [];
    for (const doc of missing) {
        const nums = (doc.questions || []).map(q => q.number).filter(n => n != null).sort((a, b) => a - b);
        if (!nums.length) continue;
        const fname = expectedFilename(SOURCE, nums);
        const abs = path.join(PUB, 'assets', 'audio', SOURCE, fname);
        const base = path.parse(fname).name;

        if (!fs.existsSync(abs)) { noFile.push(`assets/audio/${SOURCE}/${fname}  (Part ${doc.part}, câu ${nums[0]}-${nums[nums.length - 1]})`); continue; }

        console.log(`  ${fname}  →  cloud ${SOURCE}/${base}  (Part ${doc.part}, câu ${nums.join(',')})`);
        if (APPLY) {
            const url = await uploadFile(abs, { folder: SOURCE, resourceType: 'video', publicId: base });
            try { await cloudinary.api.update(`${SOURCE}/${base}`, { resource_type: 'video', asset_folder: SOURCE }); } catch (_) {}
            doc.audioUrl = url;
            await doc.save();
            fs.unlinkSync(abs); // Đã lên cloud (nguồn chính) → xoá bản local thừa.
        }
        uploaded++;
    }

    console.log(`\nĐã ${APPLY ? 'upload + gán audioUrl' : 'sẽ upload (dry-run)'}: ${uploaded} file.`);
    if (noFile.length) {
        console.log(`\nCHƯA CÓ FILE trên đĩa (${noFile.length}) — thả vào public/... rồi chạy lại:`);
        noFile.forEach(r => console.log('   ', r));
    }
    await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
