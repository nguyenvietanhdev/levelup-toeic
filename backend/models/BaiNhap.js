const mongoose = require('mongoose');

/**
 * BÀI LÀM DỞ của Viết / Dịch — đề đã lấy (AI sinh) và phần đã gõ.
 *
 * Lấy đề là một lượt gọi AI. Trước đây thoát giữa chừng là mất cả đề lẫn bài, vào
 * lại phải lấy đề mới — tốn thêm một lượt AI và bỏ phí phần đã viết. Giờ đề được
 * lưu ngay khi sinh ra, phần gõ tự lưu, vào lại thì làm tiếp.
 *
 * Mỗi (người, chế độ, ngôn ngữ) chỉ MỘT bài nháp: lấy đề mới là thay bài cũ.
 * `de` do SERVER ghi (lúc sinh đề), client chỉ cập nhật được `noiDung`.
 * Tự xoá sau 14 ngày không động tới.
 */
const baiNhapSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        mode: { type: String, enum: ['viet', 'dich'], required: true },
        lang: { type: String, enum: ['en', 'zh'], default: 'en' },
        // Nguyên phản hồi lấy đề (đề, dạng bài, mức, kiểu chấm…) để dựng lại màn làm bài.
        de: { type: mongoose.Schema.Types.Mixed, required: true },
        noiDung: { type: String, default: '', maxlength: 20000 },
    },
    { timestamps: true, collection: 'bai_nhap' },
);

baiNhapSchema.index({ userId: 1, mode: 1, lang: 1 }, { unique: true });
baiNhapSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 14 * 24 * 3600 });

module.exports = mongoose.model('BaiNhap', baiNhapSchema);
