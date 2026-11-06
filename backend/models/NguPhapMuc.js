const mongoose = require('mongoose');

/**
 * Phần do AI mở rộng cho Công thức ngữ pháp, dùng chung cho mọi người để mỗi nội dung chỉ
 * tốn AI một lần. `khoa`: 'hoi:<câu tra đã chuẩn hoá>' (chủ điểm mới), hoặc 'kho:<id>'
 * (chỉ giữ ví dụ thêm cho một mục trong kho lõi).
 */
const nguPhapMucSchema = new mongoose.Schema(
    {
        khoa: { type: String, required: true, unique: true, maxlength: 120 },
        noiDung: { type: mongoose.Schema.Types.Mixed, default: null },
        timKiem: { type: String, default: '' },
        viDuThem: { type: [{ en: String, vi: String, _id: false }], default: [] },
    },
    { timestamps: true, collection: 'ngu_phap_muc' },
);

nguPhapMucSchema.index({ timKiem: 1 });

module.exports = mongoose.model('NguPhapMuc', nguPhapMucSchema);
