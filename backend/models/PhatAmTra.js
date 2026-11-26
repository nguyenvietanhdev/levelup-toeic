const mongoose = require('mongoose');

/**
 * Kết quả Tra cứu phát âm đã hỏi AI, dùng lại cho mọi người: cùng một câu cùng ngôn ngữ thì cách
 * đọc không đổi — hỏi lại là trả tiền cho cùng một câu mãi. `khoa` = mã ngôn ngữ + câu đã chuẩn hoá.
 */
const phatAmTraSchema = new mongoose.Schema(
    {
        khoa: { type: String, required: true },
        lang: { type: String, required: true },
        text: { type: String, required: true },
        ketQua: { type: mongoose.Schema.Types.Mixed, required: true },
        luotXem: { type: Number, default: 1 },
    },
    { timestamps: true, collection: 'phat_am_tra' },
);

phatAmTraSchema.index({ khoa: 1 }, { unique: true });

module.exports = mongoose.model('PhatAmTra', phatAmTraSchema);
