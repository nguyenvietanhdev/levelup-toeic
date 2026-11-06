/**
 * Chuyển từ cũ ở Part cố định DICH-NHANH sang Part theo ngày đã lưu (vd 06-11-2026-EN).
 *
 * Vì sao cần: từ mới lưu từ Dịch nhanh đã vào Part theo ngày (`partTheoNgay` ở
 * TranslateModal.jsx), còn từ cũ vẫn gom một chỗ nên không biết từ nào lưu hôm nào.
 *
 * Chỉ đổi `part`, chỉ của MỘT người (bắt buộc --email), và chỉ các Part do chính Dịch nhanh
 * đặt: Part người dùng tự đặt tên không bị xếp lại. Ngày tính theo giờ Việt Nam. Trước khi
 * ghi sẽ lưu bản sao để hoàn tác được.
 *
 * Chạy thử:  node scripts/dichNhanhSangPartNgay.js --email=ten@vidu.com
 * Chạy thật: node scripts/dichNhanhSangPartNgay.js --email=ten@vidu.com --apply
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const UserUpload = require('../models/UserUpload');

const HANZI = /[一-鿿㐀-䶿]/;
const PART_CU = /^DICH-NHANH(-EN|-ZH)?$/i;
const LECH_GIO_VN = 7 * 60 * 60 * 1000;

/** Part theo ngày, cùng định dạng với partTheoNgay ở TranslateModal.jsx (thuần). */
function partMoi(row) {
    const d = new Date(new Date(row.createdAt).getTime() + LECH_GIO_VN);
    const p = (n) => String(n).padStart(2, '0');
    const zh = row.lang === 'zh' || (row.lang !== 'en' && HANZI.test(row.en || ''));
    return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}-${zh ? 'ZH' : 'EN'}`;
}

async function main() {
    const email = (process.argv.find((a) => a.startsWith('--email=')) || '').slice(8).trim().toLowerCase();
    const apply = process.argv.includes('--apply');
    if (!email) throw new Error('Thiếu --email=...');

    await mongoose.connect(process.env.MONGODB_URI);
    const rows = await UserUpload.find({ ownerEmail: email, part: PART_CU })
        .select('en lang source part createdAt').lean();
    const khongNgay = rows.filter((r) => !r.createdAt);
    const chuyen = rows.filter((r) => r.createdAt).map((r) => ({ _id: r._id, en: r.en, tu: r.part, sang: partMoi(r) }));

    const theoPart = {};
    for (const c of chuyen) theoPart[c.sang] = (theoPart[c.sang] || 0) + 1;
    console.log(`Từ ở Part DICH-NHANH: ${rows.length} (không có ngày tạo, giữ nguyên: ${khongNgay.length})`);
    for (const [k, v] of Object.entries(theoPart).sort()) console.log(`  ${k}: ${v}`);
    console.log('Ví dụ:', chuyen.slice(0, 4).map((c) => `${c.en} → ${c.sang}`).join(' · '));

    if (!apply || !chuyen.length) {
        console.log(apply ? 'Không có gì để chuyển.' : '[CHẠY THỬ] Chưa ghi gì. Thêm --apply để thực hiện.');
        return mongoose.disconnect();
    }

    const sao = path.join(__dirname, `backup-dich-nhanh-part-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(sao, JSON.stringify(chuyen, null, 2));
    console.log('Bản sao:', sao);

    const r = await UserUpload.bulkWrite(chuyen.map((c) => ({
        updateOne: { filter: { _id: c._id, part: c.tu }, update: { $set: { part: c.sang } } },
    })));
    const con = await UserUpload.countDocuments({ ownerEmail: email, part: PART_CU });
    console.log(`Đã chuyển ${r.modifiedCount}/${chuyen.length}. Kiểm lại: Part cũ còn ${con}.`);
    return mongoose.disconnect();
}

if (require.main === module) {
    main().catch((err) => { console.error('LỖI:', err.message); process.exit(1); });
}

module.exports = { partMoi, PART_CU };
