/**
 * Đổi đuôi ảnh trong DB: .jpg/.jpeg → .png (CHỈ sửa chuỗi đường dẫn, KHÔNG đụng file).
 * Dùng khi bạn tự convert/đổi tên file trên đĩa sang .png bằng tay.
 *
 * Chạy: node scripts/imageExtToPng.js          (xem trước, KHÔNG ghi)
 *       node scripts/imageExtToPng.js --apply   (ghi vào DB)
 *       node scripts/imageExtToPng.js --revert --apply   (đổi ngược .png → .jpg)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ToeicQuestion = require('../models/ToeicQuestion');

const APPLY = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');

const convert = (u) => REVERT
    ? u.replace(/\.png$/i, '.jpg')
    : u.replace(/\.jpe?g$/i, '.png');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

    const match = REVERT ? /\.png$/i : /\.jpe?g$/i;
    const rows = await ToeicQuestion.find({ 'imageUrls.0': { $exists: true } })
        .select('part source imageUrls').lean();

    const ops = [];
    let changed = 0;
    const preview = [];

    for (const r of rows) {
        const next = (r.imageUrls || []).map(u => (match.test(u) ? convert(u) : u));
        if (JSON.stringify(next) !== JSON.stringify(r.imageUrls)) {
            changed++;
            if (preview.length < 8) preview.push(`  P${r.part} [${r.source || '-'}]  ${r.imageUrls[0]}  →  ${next[0]}`);
            ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { imageUrls: next } } } });
        }
    }

    console.log(`Câu hỏi có ảnh: ${rows.length} | sẽ đổi: ${changed}  (${REVERT ? '.png → .jpg' : '.jpg/.jpeg → .png'})`);
    if (preview.length) { console.log('\n--- ví dụ ---'); preview.forEach(p => console.log(p)); }

    if (APPLY && ops.length) {
        const res = await ToeicQuestion.bulkWrite(ops);
        console.log(`\n✅ Đã ghi: ${res.modifiedCount} câu.`);
        console.log('   Nhớ đổi tên/convert file trên đĩa cho khớp, nếu không ảnh sẽ 404.');
        console.log('   Muốn quay lại: node scripts/imageExtToPng.js --revert --apply');
    } else if (!APPLY) {
        console.log('\n（xem trước — thêm --apply để ghi vào DB）');
    }
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
