/**
 * Xem các báo cáo nội dung ngữ pháp bị sai, và khôi phục nếu báo nhầm. Cùng logic với tab
 * "Nội dung AI" trong admin panel (services/nguPhapQuanTri.js).
 *
 * Xem:        node scripts/xemBaoSai.js
 * Khôi phục:  node scripts/xemBaoSai.js --khoi-phuc=<id báo cáo>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { danhSachBaoCao, khoiPhuc, tomTat } = require('../services/nguPhapQuanTri');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const thamSo = process.argv.find((a) => a.startsWith('--khoi-phuc='));
    if (thamSo) {
        const r = await khoiPhuc(thamSo.slice('--khoi-phuc='.length));
        console.log(r.loi ? `KHÔNG khôi phục: ${r.loi}` : `Đã khôi phục: ${r.noiDung}`);
    } else {
        const { baoCao, thongKe } = await danhSachBaoCao({ trangThai: 'cho-xu-ly' });
        console.log(`Chờ xử lý: ${thongKe['cho-xu-ly']} · Đã xác nhận sai: ${thongKe['da-xac-nhan']} · Đã khôi phục: ${thongKe['da-khoi-phuc']}`);
        for (const b of baoCao) console.log(`${b.id} | ${b.congThuc} | ${b.noiDung}`);
    }
    await mongoose.disconnect();
}

if (require.main === module) {
    main().catch((err) => { console.error('LỖI:', err.message); process.exit(1); });
}

module.exports = { tomTat };
