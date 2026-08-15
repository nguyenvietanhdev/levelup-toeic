/**
 * Chuẩn hoá trường `type` (loại từ) của kho từ vựng TIẾNG TRUNG.
 *
 * Vì sao: kho zh có tới 95 giá trị khác nhau cho một trường lẽ ra chỉ vài chục.
 * Đổ thẳng vào ô lọc là ra danh sách 95 mục, trong đó rất nhiều cặp TRÙNG NGHĨA.
 * Ba loại lộn xộn:
 *
 *   1. DẤU CÁCH quanh "/" — `动词/名词` (151 từ) và `动词 / 名词` (114 từ) là một.
 *   2. THỨ TỰ — `动词/名词` (151) và `名词/动词` (36) cũng là một.
 *   3. ĐỒNG NGHĨA — `叹词` (10) và `感叹词` (1) đều là thán từ.
 *
 * Cách gộp: bỏ khoảng trắng quanh "/", quy các từ đồng nghĩa về một dạng, rồi
 * SẮP XẾP các thành phần theo thứ tự từ loại chuẩn. Nhờ vậy `动词/名词` và
 * `名词/动词` cùng ra `名词/动词`.
 *
 * KHÔNG đụng tới `bộ thủ` (483 từ): đó là nhãn tiếng Việt cho bộ thủ chữ Hán,
 * không phải từ loại — gộp vào đây là sai nghĩa.
 *
 * AN TOÀN:
 *   - Mặc định chạy KHÔ (dry-run). Phải thêm --apply mới ghi.
 *   - Ghi backup JSON trước khi đổi, kèm lệnh hoàn tác.
 *
 * Dùng:
 *   node scripts/normalize-zh-type.js            # xem trước
 *   node scripts/normalize-zh-type.js --apply    # thực thi
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

// MỘT bản duy nhất, dùng chung với lúc nhập từ mới (uploadController). Chép
// làm hai bản thì dữ liệu mới lại lệch với dữ liệu vừa dọn bằng chính script này.
const { normalizeWordType } = require('../utils/wordType');

const normalizeType = (raw) => normalizeWordType(raw, 'zh');

module.exports = { normalizeType };

// Chạy trực tiếp mới thực hiện migration; `require` từ test thì không.
if (require.main === module) {
    (async () => {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!uri) throw new Error('Thiếu MONGO_URI trong .env');
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
        const col = mongoose.connection.collection('vocabularies_zh');

        const docs = await col.find({}).project({ _id: 1, type: 1 }).toArray();

        // Chỉ lấy những doc THẬT SỰ đổi — chạy lại lần hai không đổi thêm gì.
        const changes = [];
        for (const d of docs) {
            const to = normalizeType(d.type);
            if (to !== String(d.type ?? '')) changes.push({ _id: d._id, from: d.type, to });
        }

        if (!changes.length) {
            console.log('Không có gì để chuẩn hoá — có thể đã chạy rồi.');
            await mongoose.disconnect();
            return;
        }

        const plan = new Map();
        for (const c of changes) {
            const key = `${c.from}|${c.to}`;
            plan.set(key, (plan.get(key) || 0) + 1);
        }

        const before = new Set(docs.map((d) => String(d.type ?? '')));
        const after = new Set(docs.map((d) => normalizeType(d.type)));

        console.log(`\n${APPLY ? '>>> THỰC THI' : '>>> XEM TRƯỚC (chưa ghi gì)'}`);
        console.log(`Số giá trị khác nhau: ${before.size} → ${after.size}\n`);
        console.log('  ' + 'CŨ'.padEnd(24) + '→ MỚI'.padEnd(24) + 'SỐ TỪ');
        console.log('  ' + '-'.repeat(58));
        for (const [key, n] of [...plan.entries()].sort((a, b) => b[1] - a[1])) {
            const [from, to] = key.split('|');
            console.log('  ' + from.padEnd(24) + ('→ ' + to).padEnd(24) + n);
        }
        console.log(`\nTổng: ${changes.length} từ sẽ đổi.`);

        if (!APPLY) {
            console.log('\nChạy lại với --apply để thực thi.\n');
            await mongoose.disconnect();
            return;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(__dirname, `backup-zh-type-${stamp}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(changes, null, 1), 'utf8');
        console.log(`\nĐã lưu backup: ${backupPath}`);

        // Gom theo giá trị đích rồi cập nhật hàng loạt.
        const byTarget = new Map();
        for (const c of changes) {
            if (!byTarget.has(c.to)) byTarget.set(c.to, []);
            byTarget.get(c.to).push(c._id);
        }

        let total = 0;
        for (const [to, ids] of byTarget) {
            const r = await col.updateMany({ _id: { $in: ids } }, { $set: { type: to } });
            total += r.modifiedCount;
        }

        console.log(`Xong: đã chuẩn hoá ${total} từ.`);
        console.log(`Hoàn tác: node scripts/restore-zh-type.js "${path.basename(backupPath)}"\n`);
        await mongoose.disconnect();
    })().catch((err) => {
        console.error('LỖI:', err.message);
        process.exit(1);
    });
}
