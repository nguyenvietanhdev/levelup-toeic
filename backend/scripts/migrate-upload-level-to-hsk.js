/**
 * Chuyển `level` của từ vựng TIẾNG TRUNG do NGƯỜI DÙNG tải lên: CEFR → HSK.
 *
 * Đợt migration trước chỉ dọn kho chung (`vocabularies_zh`). Từ người dùng nhập
 * SAU đó vẫn còn ghi A1/A2 — hiện có 64 từ, và con số này còn tăng nếu ai đó
 * dùng prompt AI bản cũ.
 *
 * Ánh xạ (giống migrate-zh-level-to-hsk.js):
 *   A1 → HSK1     B1 → HSK3     C1 → HSK5
 *   A2 → HSK2     B2 → HSK4     C2 → HSK7-9
 *
 * KHÁC bản kho chung ở chỗ KHÔNG đọc `source` để đoán mức: tên bộ do người dùng
 * tự đặt ("zh_giaotiep_tuvung", "hocgiaotiep") nên chẳng nói gì về trình độ.
 * C1 ở đây quy về HSK5 — mức thấp hơn trong hai lựa chọn, vì đoán thấp thì từ
 * vẫn xuất hiện ở bộ lọc "Khó", còn đoán cao là nó biến khỏi mức người dùng
 * mong đợi.
 *
 * AN TOÀN:
 *   - Mặc định chạy KHÔ (dry-run). Phải thêm --apply mới ghi.
 *   - Ghi backup JSON trước khi đổi.
 *
 * Dùng:
 *   node scripts/migrate-upload-level-to-hsk.js            # xem trước
 *   node scripts/migrate-upload-level-to-hsk.js --apply    # thực thi
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

const CEFR_TO_HSK = {
    A1: 'HSK1', A2: 'HSK2',
    B1: 'HSK3', B2: 'HSK4',
    C1: 'HSK5', C2: 'HSK7-9',
};

(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Thiếu MONGO_URI trong .env');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const col = mongoose.connection.collection('user_upload');

    // CHỈ tiếng Trung. Từ tiếng Anh giữ nguyên CEFR — đó mới là khung đúng của chúng.
    const docs = await col
        .find({ lang: 'zh', level: { $regex: '^[ABC][12]$', $options: 'i' } })
        .project({ _id: 1, en: 1, level: 1, source: 1 })
        .toArray();

    if (!docs.length) {
        console.log('Không còn từ tiếng Trung nào dùng CEFR.');
        await mongoose.disconnect();
        return;
    }

    const changes = [];
    for (const d of docs) {
        const to = CEFR_TO_HSK[String(d.level).trim().toUpperCase()];
        if (to) changes.push({ _id: d._id, from: d.level, to, source: d.source, en: d.en });
    }

    const plan = new Map();
    for (const c of changes) {
        const key = `${c.source}|${c.from}|${c.to}`;
        plan.set(key, (plan.get(key) || 0) + 1);
    }

    console.log(`\n${APPLY ? '>>> THỰC THI' : '>>> XEM TRƯỚC (chưa ghi gì)'}\n`);
    console.log('  ' + 'NGUỒN'.padEnd(24) + 'CŨ'.padEnd(6) + '→ MỚI'.padEnd(12) + 'SỐ TỪ');
    console.log('  ' + '-'.repeat(52));
    for (const [key, n] of [...plan.entries()].sort((a, b) => b[1] - a[1])) {
        const [src, from, to] = key.split('|');
        console.log('  ' + src.padEnd(24) + from.padEnd(6) + ('→ ' + to).padEnd(12) + n);
    }
    console.log(`\nTổng: ${changes.length} từ sẽ đổi.`);

    if (!APPLY) {
        console.log('\nChạy lại với --apply để thực thi.\n');
        await mongoose.disconnect();
        return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(__dirname, `backup-upload-level-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(changes, null, 1), 'utf8');
    console.log(`\nĐã lưu backup: ${backupPath}`);

    const byTarget = new Map();
    for (const c of changes) {
        if (!byTarget.has(c.to)) byTarget.set(c.to, []);
        byTarget.get(c.to).push(c._id);
    }

    let total = 0;
    for (const [to, ids] of byTarget) {
        const r = await col.updateMany({ _id: { $in: ids } }, { $set: { level: to } });
        total += r.modifiedCount;
        console.log(`  ${to.padEnd(8)} ← ${r.modifiedCount} từ`);
    }

    console.log(`\nXong: đã đổi ${total} từ.`);
    console.log(`Hoàn tác: node scripts/restore-upload-level.js "${path.basename(backupPath)}"\n`);
    await mongoose.disconnect();
})().catch((err) => {
    console.error('LỖI:', err.message);
    process.exit(1);
});
