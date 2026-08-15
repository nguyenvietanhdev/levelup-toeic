/**
 * Sửa `lang` cho từ vựng người dùng tải lên bị gắn SAI ngôn ngữ.
 *
 * Vì sao: prompt AI có dặn ghi đúng `lang`, nhưng AI vẫn ghi nhầm. Kho hiện có
 * 19 từ chữ Hán (你, 好, 老师, 谢谢…) mang `lang: 'en'` trong bộ `hocgiaotiep`.
 *
 * Hỏng IM LẶNG, hai hậu quả:
 *   - TTS đọc chữ Hán bằng giọng TIẾNG ANH.
 *   - Bộ đó không hiện ra khi người dùng đang học tiếng Trung.
 *
 * Chỉ sửa MỘT CHIỀU: từ có chữ Hán → 'zh'. KHÔNG suy ngược, vì chuỗi không có
 * chữ Hán vẫn có thể là tiếng Trung viết bằng pinyin — đổi bừa là hỏng thêm.
 *
 * AN TOÀN:
 *   - Mặc định chạy KHÔ (dry-run). Phải thêm --apply mới ghi.
 *   - Ghi backup JSON trước khi đổi.
 *
 * Dùng:
 *   node scripts/fix-upload-lang.js            # xem trước
 *   node scripts/fix-upload-lang.js --apply    # thực thi
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

/** Khối CJK Unified Ideographs. */
const HAN_RE = /[一-鿿]/;

(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Thiếu MONGO_URI trong .env');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const col = mongoose.connection.collection('user_upload');

    const docs = await col
        .find({ lang: { $ne: 'zh' } })
        .project({ _id: 1, en: 1, vn: 1, source: 1, lang: 1 })
        .toArray();

    const changes = docs.filter((d) => HAN_RE.test(String(d.en || '')));

    if (!changes.length) {
        console.log('Không có từ nào gắn sai ngôn ngữ.');
        await mongoose.disconnect();
        return;
    }

    const bySource = new Map();
    for (const c of changes) {
        bySource.set(c.source, (bySource.get(c.source) || 0) + 1);
    }

    console.log(`\n${APPLY ? '>>> THỰC THI' : '>>> XEM TRƯỚC (chưa ghi gì)'}\n`);
    console.log('  Từ chứa chữ Hán nhưng lang ≠ zh:');
    for (const [src, n] of bySource) console.log(`    ${String(src).padEnd(20)} ${n} từ`);
    console.log('\n  Ví dụ:');
    for (const c of changes.slice(0, 5)) {
        console.log(`    ${String(c.en).padEnd(8)} (${c.vn || '—'})  lang: ${c.lang} → zh`);
    }
    console.log(`\nTổng: ${changes.length} từ sẽ đổi.`);

    if (!APPLY) {
        console.log('\nChạy lại với --apply để thực thi.\n');
        await mongoose.disconnect();
        return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(__dirname, `backup-upload-lang-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(changes, null, 1), 'utf8');
    console.log(`\nĐã lưu backup: ${backupPath}`);

    const r = await col.updateMany(
        { _id: { $in: changes.map((c) => c._id) } },
        { $set: { lang: 'zh' } },
    );

    console.log(`Xong: đã sửa ${r.modifiedCount} từ.\n`);
    await mongoose.disconnect();
})().catch((err) => {
    console.error('LỖI:', err.message);
    process.exit(1);
});
