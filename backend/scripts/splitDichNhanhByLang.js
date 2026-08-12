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

const ZH_SOURCE = 'dich-nhanh-zh';
const ZH_PART = 'DICH-NHANH-ZH';

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    // Chỉ đụng vào kho 'dich-nhanh' gốc — các nguồn khác do người dùng tự đặt tên,
    // không được tự ý xếp lại.
    const rows = await UserUpload.find({ source: 'dich-nhanh' })
        .select('en lang source part ownerEmail').lean();

    const toMove = rows.filter(r =>
        r.lang === 'zh' || (r.lang !== 'en' && HANZI.test(r.en || ''))
    );

    console.log(`Kho 'dich-nhanh': ${rows.length} từ`);
    console.log(`  cần chuyển sang '${ZH_SOURCE}': ${toMove.length}`);
    console.log(`  giữ nguyên (tiếng Anh): ${rows.length - toMove.length}`);

    if (toMove.length === 0) {
        console.log('Không có gì để chuyển.');
        return mongoose.disconnect();
    }

    console.log('\nVí dụ:', toMove.slice(0, 5).map(r => r.en).join(' · '));

    if (!APPLY) {
        console.log('\n[CHẠY THỬ] Chưa ghi gì. Thêm --apply để thực hiện.');
        return mongoose.disconnect();
    }

    const res = await UserUpload.updateMany(
        { _id: { $in: toMove.map(r => r._id) } },
        { $set: { source: ZH_SOURCE, part: ZH_PART, lang: 'zh' } }
    );
    console.log(`\nĐã chuyển ${res.modifiedCount} từ sang '${ZH_SOURCE}'.`);

    // Đối chiếu lại từ DB thay vì tin vào modifiedCount — số đó chỉ nói lệnh chạy,
    // không nói kết quả đúng.
    const left = await UserUpload.countDocuments({ source: 'dich-nhanh' });
    const moved = await UserUpload.countDocuments({ source: ZH_SOURCE });
    console.log(`Kiểm lại: 'dich-nhanh' còn ${left} · '${ZH_SOURCE}' có ${moved}`);

    await mongoose.disconnect();
}

main().catch(err => { console.error('LỖI:', err.message); process.exit(1); });
