/**
 * Hoàn tác migrate-zh-level-to-hsk.js — trả `level` về đúng giá trị trong backup.
 *
 * Migration mà không có đường lùi thì không ai dám chạy. File backup do chính
 * script migrate ghi ra, nằm cùng thư mục này.
 *
 * Dùng:
 *   node scripts/restore-zh-level.js backup-zh-level-2026-08-15T....json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const file = process.argv[2];
if (!file) {
    console.error('Thiếu tên file backup.\nVí dụ: node scripts/restore-zh-level.js backup-zh-level-....json');
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

    const docs = JSON.parse(fs.readFileSync(full, 'utf8'));
    console.log(`Khôi phục ${docs.length} từ từ ${path.basename(full)}...`);

    // Gom theo level cũ rồi ghi hàng loạt — cùng cách với script migrate.
    const byLevel = new Map();
    for (const d of docs) {
        if (!byLevel.has(d.level)) byLevel.set(d.level, []);
        byLevel.get(d.level).push(new mongoose.Types.ObjectId(d._id));
    }

    let total = 0;
    for (const [level, ids] of byLevel) {
        const r = await col.updateMany({ _id: { $in: ids } }, { $set: { level } });
        total += r.modifiedCount;
        console.log(`  ${String(level).padEnd(8)} ← ${r.modifiedCount} từ`);
    }

    console.log(`\nXong: đã khôi phục ${total} từ.\n`);
    await mongoose.disconnect();
})().catch((err) => {
    console.error('LỖI:', err.message);
    process.exit(1);
});
