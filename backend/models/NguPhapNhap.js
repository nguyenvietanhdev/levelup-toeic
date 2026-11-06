const mongoose = require('mongoose');

/**
 * Bản nháp AI soạn, chờ người học quyết định có thêm vào thư viện chung không. Giữ ở server
 * để lúc thêm không phải tin nội dung client gửi lên. Tự xoá sau 1 ngày nếu không ai thêm.
 */
const nguPhapNhapSchema = new mongoose.Schema(
    {
        khoa: { type: String, required: true, unique: true, maxlength: 120 },
        noiDung: { type: mongoose.Schema.Types.Mixed, required: true },
        taoLuc: { type: Date, default: Date.now },
    },
    { collection: 'ngu_phap_nhap' },
);

nguPhapNhapSchema.index({ taoLuc: 1 }, { expireAfterSeconds: 24 * 3600 });

module.exports = mongoose.model('NguPhapNhap', nguPhapNhapSchema);
