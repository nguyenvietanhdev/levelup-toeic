const mongoose = require('mongoose');

/**
 * Một lượt luyện ngữ pháp. Giữ danh sách câu ở server: đáp án chỉ về client sau khi chấm từng
 * câu, và mỗi câu chỉ chấm một lần nên số lượt gọi AI có trần. Tự xoá sau 2 ngày.
 *
 * Kiểm tra tổng hợp: `tongHop` = true, `mucId` = 'tong-hop:<lang>', và mỗi câu tự mang `mucId`
 * của chủ điểm nó thuộc về (câu lấy từ bộ câu của nhiều mục).
 */
const buoiNguPhapSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        mucId: { type: String, required: true, maxlength: 60 },
        cau: {
            type: [{
                so: { type: Number, required: true }, // vị trí trong bộ câu của mục
                mucId: { type: String, maxlength: 60 }, // chỉ có ở kiểm tra tổng hợp
                daTra: { type: Boolean, default: false },
                dung: { type: Boolean, default: false },
                khongChac: { type: Boolean, default: false },
                _id: false,
            }],
            default: [],
        },
        daTongKet: { type: Boolean, default: false },
        tongHop: { type: Boolean, default: false },
        lang: { type: String, enum: ['en', 'zh'], default: 'en' },
    },
    { timestamps: true, collection: 'buoi_ngu_phap' },
);

buoiNguPhapSchema.index({ userId: 1, createdAt: -1 });
buoiNguPhapSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 3600 });

module.exports = mongoose.model('BuoiNguPhap', buoiNguPhapSchema);
