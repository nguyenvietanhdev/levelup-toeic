const mongoose = require('mongoose');

/**
 * Báo cáo nội dung ngữ pháp do AI tạo bị sai. Giữ bản sao nội dung để người quản trị đọc lại và
 * khôi phục được nếu báo nhầm (`scripts/xemBaoSai.js`).
 */
const nguPhapBaoSaiSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        loai: { type: String, enum: ['cau', 'muc'], required: true },
        mucId: { type: String, required: true, maxlength: 60 },
        so: { type: Number, default: -1 }, // vị trí câu trong bộ câu; mục thì -1
        banSao: { type: mongoose.Schema.Types.Mixed, default: null },
        daKhoiPhuc: { type: Boolean, default: false },
        // Người quản trị đã xác nhận nội dung sai: giữ ẩn, không cần xem lại.
        daXuLy: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'ngu_phap_bao_sai' },
);

nguPhapBaoSaiSchema.index({ userId: 1, loai: 1, mucId: 1, so: 1 }, { unique: true });
nguPhapBaoSaiSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('NguPhapBaoSai', nguPhapBaoSaiSchema);
