/**
 * Dọn ảnh mồ côi trong public/uploads (file không còn được DB/registry tham chiếu).
 *   node scripts/clean-uploads.js           # DRY — chỉ liệt kê, không xoá
 *   node scripts/clean-uploads.js --delete  # xoá thật
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const mongoose = require('mongoose');
const { findOrphans } = require('../utils/uploadCleanup');

const DEL = process.argv.includes('--delete');
const fmtKB = (n) => `${(n / 1024).toFixed(0)} KB`;

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const orphans = await findOrphans();
    if (!orphans.length) { console.log('✅ Không có ảnh mồ côi.'); await mongoose.disconnect(); return; }

    console.log(`${DEL ? '' : '[DRY] '}Tìm thấy ${orphans.length} ảnh mồ côi:\n`);
    let total = 0, removed = 0;
    for (const o of orphans) {
        total += o.size;
        if (DEL) { try { fs.unlinkSync(o.file); removed++; console.log(`  ✗ ${o.rel}  ${fmtKB(o.size)}`); } catch (e) { console.log(`  ! ${o.rel}  LỖI: ${e.message}`); } }
        else console.log(`  · ${o.rel}  ${fmtKB(o.size)}`);
    }
    console.log(`\n${DEL ? `Đã xoá ${removed}/${orphans.length} file` : `[DRY] Sẽ giải phóng`} · tổng ${fmtKB(total)}`);
    if (!DEL) console.log('→ Chạy lại với --delete để xoá thật.');
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
