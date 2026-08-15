/**
 * Hoàn tác normalize-zh-type.js — trả `type` về đúng giá trị trong backup.
 *
 * File backup do chính script chuẩn hoá ghi ra, nằm cùng thư mục này. Mỗi dòng
 * có { _id, from, to } nên khôi phục là ghi lại `from`.
 *
 * Dùng:
 *   node scripts/restore-zh-type.js backup-zh-type-2026-08-15T....json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const file = process.argv[2];
if (!file) {
    console.error('Thiếu tên file backup.\nVí dụ: node scripts/restore-zh-type.js backup-zh-type-....json');
    process.exit(1);
}

const full = path.isAbsolute(file) ? file : path.join(__dirname, file);
if (!fs.existsSync(full)) {
    console.error(`Không tìm thấy file: ${full}`);
    process.exit(1);
}

(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Thiếu MONGO_URI trong .env');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const col = mongoose.connection.collection('vocabularies_zh');

    const rows = JSON.parse(fs.readFileSync(full, 'utf8'));
    console.log(`Khôi phục ${rows.length} từ từ ${path.basename(full)}...`);

    // Gom theo giá trị CŨ rồi ghi hàng loạt.
    const byOld = new Map();
    for (const r of rows) {
        const key = String(r.from ?? '');
        if (!byOld.has(key)) byOld.set(key, []);
        byOld.get(key).push(new mongoose.Types.ObjectId(r._id));
    }

    let total = 0;
    for (const [type, ids] of byOld) {
        const res = await col.updateMany({ _id: { $in: ids } }, { $set: { type } });
        total += res.modifiedCount;
    }

    console.log(`\nXong: đã khôi phục ${total} từ.\n`);
    await mongoose.disconnect();
})().catch((err) => {
    console.error('LỖI:', err.message);
    process.exit(1);
});
