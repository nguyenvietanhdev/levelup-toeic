/**
 * Tách từ đã lưu qua "Dịch nhanh" thành hai kho theo ngôn ngữ.
 *
 * Vì sao cần: mọi từ lưu từ Dịch nhanh đều vào source 'dich-nhanh' /
 * part 'DICH-NHANH', bất kể tiếng Anh hay tiếng Trung. Luyện tập lọc theo `part`
 * (practiceManager.js:76), nên chọn Part đó lúc đang học tiếng Anh sẽ ra lẫn chữ
 * Hán — và ngược lại.
 *
 * Kiểm dữ liệu thật trước khi viết: 20/21 bản ghi là chữ Hán, chỉ 1 từ Latin.
 * Nên KHÔNG thể để tiếng Trung ở lại 'dich-nhanh' — phải chuyển đúng chỗ, không
 * thì 20 từ nằm sai kho vĩnh viễn.
 *
 * Nhận diện: ưu tiên trường `lang` nếu có, không thì nhìn mặt chữ (chữ Hán không
 * bao giờ xuất hiện trong một từ tiếng Anh thật).
 *
 * Chạy thử:  node scripts/splitDichNhanhByLang.js
 * Chạy thật: node scripts/splitDichNhanhByLang.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const UserUpload = require('../models/UserUpload');

const HANZI = /[一-鿿㐀-䶿]/;
const APPLY = process.argv.includes('--apply');

// Cả hai kho đều mang hậu tố ngôn ngữ. 'dich-nhanh' trơ trọi không nói được nó
// chứa thứ tiếng gì, mà giờ có hai kho — nên kho cũ được dọn sạch, không giữ lại
// làm kho tiếng Anh.
const ZH_SOURCE = 'dich-nhanh-zh';
const ZH_PART = 'DICH-NHANH-ZH';
const EN_SOURCE = 'dich-nhanh-en';
const EN_PART = 'DICH-NHANH-EN';

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    // Chỉ đụng vào kho 'dich-nhanh' gốc — các nguồn khác do người dùng tự đặt tên,
    // không được tự ý xếp lại.
    const rows = await UserUpload.find({ source: 'dich-nhanh' })
        .select('en lang source part ownerEmail').lean();

    const isZh = r => r.lang === 'zh' || (r.lang !== 'en' && HANZI.test(r.en || ''));
    const toZh = rows.filter(isZh);
    const toEn = rows.filter(r => !isZh(r));

    console.log(`Kho 'dich-nhanh': ${rows.length} từ`);
    console.log(`  → '${ZH_SOURCE}': ${toZh.length}`);
    console.log(`  → '${EN_SOURCE}': ${toEn.length}`);

    if (rows.length === 0) {
        console.log('Kho cũ đã rỗng, không có gì để chuyển.');
        return mongoose.disconnect();
    }

    if (toZh.length) console.log('\nTiếng Trung:', toZh.slice(0, 5).map(r => r.en).join(' · '));
    if (toEn.length) console.log('Tiếng Anh:  ', toEn.slice(0, 5).map(r => r.en).join(' · '));

    if (!APPLY) {
        console.log('\n[CHẠY THỬ] Chưa ghi gì. Thêm --apply để thực hiện.');
        return mongoose.disconnect();
    }

    if (toZh.length) {
        const r = await UserUpload.updateMany(
            { _id: { $in: toZh.map(x => x._id) } },
            { $set: { source: ZH_SOURCE, part: ZH_PART, lang: 'zh' } }
        );
        console.log(`\nĐã chuyển ${r.modifiedCount} từ sang '${ZH_SOURCE}'.`);
    }
    if (toEn.length) {
        const r = await UserUpload.updateMany(
            { _id: { $in: toEn.map(x => x._id) } },
            { $set: { source: EN_SOURCE, part: EN_PART, lang: 'en' } }
        );
        console.log(`Đã chuyển ${r.modifiedCount} từ sang '${EN_SOURCE}'.`);
    }

    // Đối chiếu lại từ DB thay vì tin vào modifiedCount — số đó chỉ nói lệnh chạy,
    // không nói kết quả đúng. Kho cũ phải về 0.
    const left = await UserUpload.countDocuments({ source: 'dich-nhanh' });
    const zh = await UserUpload.countDocuments({ source: ZH_SOURCE });
    const en = await UserUpload.countDocuments({ source: EN_SOURCE });
    console.log(`Kiểm lại: 'dich-nhanh' còn ${left} · '${ZH_SOURCE}' ${zh} · '${EN_SOURCE}' ${en}`);
    if (left > 0) console.log('CẢNH BÁO: kho cũ vẫn còn từ — kiểm tra lại.');

    await mongoose.disconnect();
}

main().catch(err => { console.error('LỖI:', err.message); process.exit(1); });
