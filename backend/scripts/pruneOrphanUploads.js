/**
 * Liệt kê (và xoá nếu muốn) file trong public/uploads/ không còn ai tham chiếu.
 *
 * Sinh ra nhiều nhất sau khi nén ảnh: bản PNG gốc bị thay bằng .webp thì nằm lại
 * làm rác. Cố tình KHÔNG tự xoá khi nén — giữ bản gốc để còn đường lùi nếu ảnh
 * nén trông xấu; xoá là việc riêng, làm khi đã ưng mắt.
 *
 *   node scripts/pruneOrphanUploads.js           # chỉ liệt kê
 *   node scripts/pruneOrphanUploads.js --apply    # xoá thật (không khôi phục được)
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const mongoose = require('mongoose');
const { findOrphans } = require('../utils/uploadCleanup');

const APPLY = process.argv.includes('--apply');
const kb = (n) => `${Math.round(n / 1024)}KB`;

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const orphans = await findOrphans();
    const total = orphans.reduce((s, f) => s + f.size, 0);

    orphans
        .sort((a, b) => b.size - a.size)
        .forEach(f => console.log(`  ${APPLY ? 'xoá' : 'mồ côi'}: ${f.rel} (${kb(f.size)})`));

    if (APPLY) {
        let n = 0;
        for (const f of orphans) {
            try { fs.unlinkSync(f.file); n++; } catch (e) { console.log(`  ⚠ không xoá được ${f.rel}: ${e.message}`); }
        }
        console.log(`\nĐã xoá ${n} file · giải phóng ${kb(total)}.`);
    } else {
        console.log(`\n${orphans.length} file mồ côi · ${kb(total)}. Chạy lại với --apply để xoá.`);
    }

    await mongoose.disconnect();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
