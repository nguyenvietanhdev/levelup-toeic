const mongoose = require('mongoose');

/**
 * MỘT BUỔI KIỂM TRA LẠI LỖI. Đáp án nằm ở server (`dapAn`), client chỉ nhận đề —
 * mở DevTools không thấy đáp án. Chấm từng câu ngay khi trả lời; mỗi câu trả lời
 * MỘT lần. Tự xoá sau 2 ngày.
 */
const buoiOnLoiSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        cau: {
            type: [{
                loiId: { type: mongoose.Schema.Types.ObjectId, ref: 'LoiOn' },
                dang: String,                       // tim-loi | sua-loi | ly-do | cau-moi | dung-sai
                de: mongoose.Schema.Types.Mixed,    // phần gửi client
                dapAn: mongoose.Schema.Types.Mixed, // chỉ server
                tinhNac: { type: Boolean, default: true }, // false: câu thêm (Đúng hay sai), không đổi nấc
                daTra: { type: Boolean, default: false },
                dung: { type: Boolean, default: false },
                _id: false,
            }],
            default: [],
        },
    },
    { timestamps: true, collection: 'buoi_on_loi' },
);

buoiOnLoiSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 3600 });

module.exports = mongoose.model('BuoiOnLoi', buoiOnLoiSchema);
