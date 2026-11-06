const mongoose = require('mongoose');

/**
 * Một lượt test đầu vào. Giữ câu hiện tại ở server: câu sau phụ thuộc kết quả câu trước,
 * và mỗi câu chỉ chấm một lần nên số lượt gọi AI có trần. Tự xoá sau 2 ngày.
 */
const buoiKiemTraSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        coMic: { type: Boolean, default: true },
        i: { type: Number, default: 0 },
        cauHienTai: { type: mongoose.Schema.Types.Mixed, default: null },
        daLam: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    { timestamps: true, collection: 'buoi_kiem_tra' },
);

buoiKiemTraSchema.index({ userId: 1, createdAt: -1 });
buoiKiemTraSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 3600 });

module.exports = mongoose.model('BuoiKiemTra', buoiKiemTraSchema);
