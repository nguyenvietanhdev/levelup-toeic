const mongoose = require('mongoose');

/** Số lượt gọi AI của Công thức ngữ pháp trong một ngày (giờ VN). Tự xoá sau 3 ngày. */
const nguPhapLuotSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        ngay: { type: String, required: true },
        so: { type: Number, default: 0 },
        taoLuc: { type: Date, default: Date.now },
    },
    { collection: 'ngu_phap_luot' },
);

nguPhapLuotSchema.index({ userId: 1, ngay: 1 }, { unique: true });
nguPhapLuotSchema.index({ taoLuc: 1 }, { expireAfterSeconds: 3 * 24 * 3600 });

module.exports = mongoose.model('NguPhapLuot', nguPhapLuotSchema);
