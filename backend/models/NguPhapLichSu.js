const mongoose = require('mongoose');

/**
 * Lịch sử từng câu ngữ pháp người học đã làm (luyện một mục hoặc kiểm tra tổng hợp), để xem lại,
 * nghe lại và lưu câu hay vào Từ vựng riêng. Buổi luyện tự xoá sau 2 ngày nên cần chỗ giữ riêng.
 * Tự xoá sau 180 ngày cho kho không phình mãi.
 */
const nguPhapLichSuSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        lang: { type: String, enum: ['en', 'zh'], default: 'en' },
        mucId: { type: String, maxlength: 60, default: '' },
        tenMuc: { type: String, maxlength: 160, default: '' },
        tongHop: { type: Boolean, default: false },
        loai: { type: String, enum: ['chon', 'sua', 'dich'], required: true },
        de: { type: String, maxlength: 260, default: '' },
        cuaBan: { type: String, maxlength: 260, default: '' },
        dapAn: { type: String, maxlength: 260, default: '' },
        cauDu: { type: String, maxlength: 260, default: '' },
        nghia: { type: String, maxlength: 260, default: '' },
        giaiThich: { type: String, maxlength: 320, default: '' },
        dung: { type: Boolean, default: false },
        khongChac: { type: Boolean, default: false },
    },
    { timestamps: { createdAt: true, updatedAt: false }, collection: 'ngu_phap_lich_su' },
);

nguPhapLichSuSchema.index({ userId: 1, lang: 1, createdAt: -1 });
nguPhapLichSuSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

module.exports = mongoose.model('NguPhapLichSu', nguPhapLichSuSchema);
