/**
 * Hoàn tác migrate-upload-level-to-hsk.js — trả `level` về CEFR ban đầu.
 *
 * Dùng:
 *   node scripts/restore-upload-level.js backup-upload-level-....json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const file = process.argv[2];
if (!file) {
    console.error('Thiếu tên file backup.\nVí dụ: node scripts/restore-upload-level.js backup-upload-level-....json');
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
    const col = mongoose.connection.collection('user_upload');

    const rows = JSON.parse(fs.readFileSync(full, 'utf8'));
    console.log(`Khôi phục ${rows.length} từ từ ${path.basename(full)}...`);

    const byOld = new Map();
    for (const r of rows) {
        const key = String(r.from ?? '');
        if (!byOld.has(key)) byOld.set(key, []);
        byOld.get(key).push(new mongoose.Types.ObjectId(r._id));
    }

    let total = 0;
    for (const [level, ids] of byOld) {
        const res = await col.updateMany({ _id: { $in: ids } }, { $set: { level } });
        total += res.modifiedCount;
    }

    console.log(`\nXong: đã khôi phục ${total} từ.\n`);
    await mongoose.disconnect();
})().catch((err) => {
    console.error('LỖI:', err.message);
    process.exit(1);
});
