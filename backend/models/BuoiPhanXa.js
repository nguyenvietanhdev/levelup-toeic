const mongoose = require('mongoose');

/**
 * Một lượt Phản xạ câu. Giữ danh sách câu ở server để mỗi câu chỉ chấm MỘT lần — câu
 * trả lời khác đáp án có thể phải hỏi AI, không chặn thì gọi lại vô hạn được.
 * Tự xoá sau 2 ngày.
 */
const buoiPhanXaSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        cau: {
            type: [{
                cauId: { type: String, required: true },
                daTra: { type: Boolean, default: false },
                dung: { type: Boolean, default: false },
                _id: false,
            }],
            default: [],
        },
    },
    { timestamps: true, collection: 'buoi_phan_xa' },
);

buoiPhanXaSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 3600 });

module.exports = mongoose.model('BuoiPhanXa', buoiPhanXaSchema);
