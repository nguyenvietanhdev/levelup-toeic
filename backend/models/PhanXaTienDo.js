const mongoose = require('mongoose');

/** Tiến độ của một người trên một câu Phản xạ (ôn giãn cách theo từng câu). */
const phanXaTienDoSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        cauId: { type: String, required: true, maxlength: 20 },
        khung: { type: String, required: true },
        buoc: { type: Number, default: 0 },
        denHan: { type: Date, default: Date.now },
        dung: { type: Number, default: 0 },
        sai: { type: Number, default: 0 },
        daThuoc: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'phan_xa_tien_do' },
);

phanXaTienDoSchema.index({ userId: 1, cauId: 1 }, { unique: true });
phanXaTienDoSchema.index({ userId: 1, denHan: 1 });

module.exports = mongoose.model('PhanXaTienDo', phanXaTienDoSchema);
