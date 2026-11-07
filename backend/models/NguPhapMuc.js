const mongoose = require('mongoose');

/**
 * Phần do AI mở rộng cho Công thức ngữ pháp, dùng chung cho mọi người để mỗi nội dung chỉ
 * tốn AI một lần. `khoa` có ba dạng:
 *   · 'hoi:<câu tra đã chuẩn hoá>' có `noiDung`: chủ điểm đã được thêm vào thư viện.
 *   · 'hoi:<câu tra đã chuẩn hoá>' có `troDen`: cách gọi khác của một mục đã có.
 *   · 'kho:<id>': chỉ giữ ví dụ thêm cho một mục trong kho lõi.
 */
const nguPhapMucSchema = new mongoose.Schema(
    {
        khoa: { type: String, required: true, unique: true, maxlength: 120 },
        // Ngôn ngữ của chủ điểm. Bản ghi cũ không có trường này là tiếng Anh.
        lang: { type: String, enum: ['en', 'zh'], default: 'en' },
        noiDung: { type: mongoose.Schema.Types.Mixed, default: null },
        troDen: { type: String, default: null },
        tenChuan: { type: String, default: '' },
        timKiem: { type: String, default: '' },
        viDuThem: { type: [{ en: String, vi: String, _id: false }], default: [] },
    },
    { timestamps: true, collection: 'ngu_phap_muc' },
);

nguPhapMucSchema.index({ tenChuan: 1 });

module.exports = mongoose.model('NguPhapMuc', nguPhapMucSchema);
