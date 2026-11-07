const mongoose = require('mongoose');

/** Tiến độ của một người trên một mục ngữ pháp (ôn giãn cách theo từng mục). */
const nguPhapTienDoSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        mucId: { type: String, required: true, maxlength: 60 },
        buoc: { type: Number, default: 0 },
        denHan: { type: Date, default: Date.now },
        daThuoc: { type: Boolean, default: false },
        soLan: { type: Number, default: 0 },
    },
    { timestamps: true, collection: 'ngu_phap_tien_do' },
);

nguPhapTienDoSchema.index({ userId: 1, mucId: 1 }, { unique: true });

module.exports = mongoose.model('NguPhapTienDo', nguPhapTienDoSchema);
