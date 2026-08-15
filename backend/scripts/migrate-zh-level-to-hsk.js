/**
 * Chuyển `level` của từ vựng TIẾNG TRUNG từ khung CEFR (A1–C2) sang khung HSK.
 *
 * Vì sao: tiếng Trung được học và phân cấp theo HSK, không phải CEFR (khung của
 * các thứ tiếng châu Âu). Kho zh đang TRỘN cả hai — 10.749 từ ghi CEFR, 1.035 từ
 * ghi HSK — nên cùng một khái niệm "độ khó" lại có hai cách viết.
 *
 * Ánh xạ:
 *   A1 → HSK1     B1 → HSK3     C1 → HSK5 hoặc HSK6
 *   A2 → HSK2     B2 → HSK4     C2 → HSK7-9
 *
 * C1 là chỗ MƠ HỒ: nó gộp cả HSK5 lẫn HSK6. Không đoán — đọc `source` để biết
 * chính xác, vì các bộ tự nói ra mức của mình (`hsk5`, `hsk6`, `hsk7-9`).
 * Chỉ khi source không cho biết gì mới rơi về mặc định.
 *
 * AN TOÀN:
 *   - Mặc định chạy KHÔ (dry-run), chỉ in ra sẽ đổi gì. Phải thêm --apply mới ghi.
 *   - Ghi backup ra file JSON trước khi đổi, kèm lệnh hoàn tác.
 *   - Chỉ đụng collection tiếng Trung; tiếng Anh giữ nguyên CEFR.
 *
 * Dùng:
 *   node scripts/migrate-zh-level-to-hsk.js            # xem trước
 *   node scripts/migrate-zh-level-to-hsk.js --apply    # thực thi
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

/** Mức HSK suy ra từ tên bộ — đáng tin hơn CEFR vì bộ tự khai mức của nó. */
function hskFromSource(source) {
    const s = String(source || '').toLowerCase();
    if (/hsk\s*7/.test(s) || /hsk7-9/.test(s)) return 'HSK7-9';
    const m = s.match(/hsk\s*([1-6])/);
    return m ? `HSK${m[1]}` : null;
}

/** Ánh xạ CEFR → HSK. C1 mơ hồ (HSK5/HSK6) nên mặc định HSK5. */
const CEFR_TO_HSK = {
    A1: 'HSK1', A2: 'HSK2',
    B1: 'HSK3', B2: 'HSK4',
    C1: 'HSK5',        // source sẽ ghi đè nếu nó là hsk6
    C2: 'HSK7-9',
};

function targetLevel(doc) {
    // 1. Ưu tiên `source` — chính xác tuyệt đối cho các bộ HSK chính thức.
    const bySource = hskFromSource(doc.source);
    if (bySource) return bySource;
    // 2. Rơi về ánh xạ CEFR cho các bộ khác (vd: 部首).
    const cefr = String(doc.level || '').trim().toUpperCase();
    return CEFR_TO_HSK[cefr] || null;
}

(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Thiếu MONGO_URI trong .env');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const col = mongoose.connection.collection('vocabularies_zh');

    // Chỉ lấy từ đang ghi CEFR. Từ đã là HSK* thì bỏ qua — chạy lại script lần
    // hai không được đổi thêm gì (idempotent).
    const docs = await col
        .find({ level: { $regex: '^[ABC][12]$', $options: 'i' } })
        .project({ _id: 1, level: 1, source: 1 })
        .toArray();

    if (!docs.length) {
        console.log('Không còn từ nào dùng CEFR — có thể đã migrate rồi.');
        await mongoose.disconnect();
        return;
    }

    // Gom theo (source, cũ → mới) để in bảng cho dễ soát.
    const plan = new Map();
    const skipped = [];
    for (const d of docs) {
        const to = targetLevel(d);
        if (!to) { skipped.push(d); continue; }
        const key = `${d.source}|${d.level}|${to}`;
        plan.set(key, (plan.get(key) || 0) + 1);
    }

    console.log(`\n${APPLY ? '>>> THỰC THI' : '>>> XEM TRƯỚC (chưa ghi gì)'} — ${docs.length} từ dùng CEFR\n`);
    console.log('  ' + 'SOURCE'.padEnd(16) + 'CŨ'.padEnd(6) + '→ MỚI'.padEnd(12) + 'SỐ TỪ');
    console.log('  ' + '-'.repeat(46));
    for (const [key, n] of [...plan.entries()].sort()) {
        const [src, from, to] = key.split('|');
        console.log('  ' + src.padEnd(16) + from.padEnd(6) + ('→ ' + to).padEnd(12) + n);
    }
    if (skipped.length) console.log(`\n  ! ${skipped.length} từ không ánh xạ được — GIỮ NGUYÊN.`);

    if (!APPLY) {
        console.log('\nChạy lại với --apply để thực thi.\n');
        await mongoose.disconnect();
        return;
    }

    // Backup TRƯỚC khi ghi. Không có backup thì không hoàn tác được.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(__dirname, `backup-zh-level-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(docs, null, 1), 'utf8');
    console.log(`\nĐã lưu backup: ${backupPath}`);

    // Gom theo mức đích rồi cập nhật hàng loạt — nhanh hơn nhiều so với sửa
    // từng document.
    const byTarget = new Map();
    for (const d of docs) {
        const to = targetLevel(d);
        if (!to) continue;
        if (!byTarget.has(to)) byTarget.set(to, []);
        byTarget.get(to).push(d._id);
    }

    let total = 0;
    for (const [to, ids] of byTarget) {
        const r = await col.updateMany({ _id: { $in: ids } }, { $set: { level: to } });
        total += r.modifiedCount;
        console.log(`  ${to.padEnd(8)} ← ${r.modifiedCount} từ`);
    }

    console.log(`\nXong: đã đổi ${total} từ.`);
    console.log(`Hoàn tác: node scripts/restore-zh-level.js "${path.basename(backupPath)}"\n`);
    await mongoose.disconnect();
})().catch((err) => {
    console.error('LỖI:', err.message);
    process.exit(1);
});
