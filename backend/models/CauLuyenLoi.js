const mongoose = require('mongoose');

/**
 * KHO CÂU MỚI cùng loại lỗi — dùng cho nấc "Áp dụng" (chống học vẹt).
 *
 * AI sinh theo lô cho từng (loại lỗi, ngôn ngữ), DÙNG CHUNG cho mọi người: câu không
 * gắn với bài của ai, nên sinh một lần là đủ cho rất nhiều buổi ôn. Mỗi câu đã qua
 * kiểm ở server (xem `kiemCauMoi` trong services/onLoi.js) trước khi được lưu.
 */
const cauLuyenLoiSchema = new mongoose.Schema(
    {
        loai: { type: String, required: true },
        lang: { type: String, enum: ['en', 'zh'], default: 'en' },
        sai: { type: String, required: true, maxlength: 300 },     // câu có lỗi
        chiSai: { type: String, required: true, maxlength: 120 },  // đúng chỗ sai (nằm trong `sai`)
        sua: { type: String, required: true, maxlength: 120 },     // chữ thay cho `chiSai`
        dung: { type: String, required: true, maxlength: 300 },    // câu đã sửa
        giaiThich: { type: String, default: '', maxlength: 300 },  // tiếng Việt
    },
    { timestamps: true, collection: 'cau_luyen_loi' },
);

cauLuyenLoiSchema.index({ loai: 1, lang: 1 });

module.exports = mongoose.model('CauLuyenLoi', cauLuyenLoiSchema);
