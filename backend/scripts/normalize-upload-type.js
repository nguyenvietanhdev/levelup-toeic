/**
 * Quy đổi `type` của từ vựng TIẾNG TRUNG do NGƯỜI DÙNG tải lên, từ nhãn tiếng
 * Anh sang chữ Hán.
 *
 * Vì sao: kho chung zh ghi `名词`, còn từ người dùng tải lên lại ghi `noun` —
 * cùng là danh từ mà nằm hai mục khác nhau. Lọc `名词` bỏ sót toàn bộ từ của
 * người dùng, và ô lọc thì hiện cả hai như hai loại riêng biệt.
 *
 * Chỉ đụng `lang: 'zh'`. Từ tiếng Anh giữ nguyên `noun`/`verb` — đó mới là hệ
 * đúng của chúng.
 *
 * AN TOÀN:
 *   - Mặc định chạy KHÔ (dry-run). Phải thêm --apply mới ghi.
 *   - Ghi backup JSON trước khi đổi, kèm lệnh hoàn tác.
 *
 * Dùng:
 *   node scripts/normalize-upload-type.js            # xem trước
 *   node scripts/normalize-upload-type.js --apply    # thực thi
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { normalizeWordType } = require('../utils/wordType');

const APPLY = process.argv.includes('--apply');

(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Thiếu MONGO_URI trong .env');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const col = mongoose.connection.collection('user_upload');

    const docs = await col
        .find({ lang: 'zh' })
        .project({ _id: 1, type: 1, source: 1 })
        .toArray();

    const changes = [];
    for (const d of docs) {
        const to = normalizeWordType(d.type, 'zh');
        if (to !== String(d.type ?? '')) changes.push({ _id: d._id, from: d.type, to, source: d.source });
    }

    if (!changes.length) {
        console.log('Không có gì để quy đổi — có thể đã chạy rồi.');
        await mongoose.disconnect();
        return;
    }

    const plan = new Map();
    for (const c of changes) {
        const key = `${c.from}|${c.to}`;
        plan.set(key, (plan.get(key) || 0) + 1);
    }

    console.log(`\n${APPLY ? '>>> THỰC THI' : '>>> XEM TRƯỚC (chưa ghi gì)'}\n`);
    console.log('  ' + 'CŨ'.padEnd(20) + '→ MỚI'.padEnd(16) + 'SỐ TỪ');
    console.log('  ' + '-'.repeat(46));
    for (const [key, n] of [...plan.entries()].sort((a, b) => b[1] - a[1])) {
        const [from, to] = key.split('|');
        console.log('  ' + (from || '(rỗng)').padEnd(20) + ('→ ' + to).padEnd(16) + n);
    }
    console.log(`\nTổng: ${changes.length} từ sẽ đổi.`);

    if (!APPLY) {
        console.log('\nChạy lại với --apply để thực thi.\n');
        await mongoose.disconnect();
        return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(__dirname, `backup-upload-type-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(changes, null, 1), 'utf8');
    console.log(`\nĐã lưu backup: ${backupPath}`);

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

    console.log(`Xong: đã quy đổi ${total} từ.`);
    console.log(`Hoàn tác: node scripts/restore-upload-type.js "${path.basename(backupPath)}"\n`);
    await mongoose.disconnect();
})().catch((err) => {
    console.error('LỖI:', err.message);
    process.exit(1);
});
