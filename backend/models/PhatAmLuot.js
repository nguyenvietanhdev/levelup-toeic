const mongoose = require('mongoose');

/** Số lượt gọi AI của Tra cứu phát âm trong một ngày (giờ VN). Tự xoá sau 3 ngày. */
const phatAmLuotSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        ngay: { type: String, required: true },
        so: { type: Number, default: 0 },
        taoLuc: { type: Date, default: Date.now },
    },
    { collection: 'phat_am_luot' },
);

phatAmLuotSchema.index({ userId: 1, ngay: 1 }, { unique: true });
phatAmLuotSchema.index({ taoLuc: 1 }, { expireAfterSeconds: 3 * 24 * 3600 });

module.exports = mongoose.model('PhatAmLuot', phatAmLuotSchema);
