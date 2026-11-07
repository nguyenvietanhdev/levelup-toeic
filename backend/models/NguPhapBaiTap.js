const mongoose = require('mongoose');

/**
 * Bộ câu luyện của một mục ngữ pháp, AI soạn một lần rồi dùng chung cho mọi người để lần sau
 * không tốn thêm token. `mucId`: id trong kho lõi, hoặc _id của mục AI đã thêm vào thư viện.
 */
const nguPhapBaiTapSchema = new mongoose.Schema(
    {
        mucId: { type: String, required: true, unique: true, maxlength: 60 },
        cau: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    { timestamps: true, collection: 'ngu_phap_bai_tap' },
);

module.exports = mongoose.model('NguPhapBaiTap', nguPhapBaiTapSchema);
