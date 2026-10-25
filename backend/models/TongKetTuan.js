const mongoose = require('mongoose');

/**
 * Bản TỔNG KẾT TUẦN do AI viết từ hồ sơ "Tiến bộ của tôi" (tầng 3).
 *
 * Mỗi (người, tuần, ngôn ngữ) chỉ gọi AI MỘT lần rồi lưu: mở lại xem không tốn
 * token, và cùng một tuần không ra hai lời khuyên khác nhau. `tuan` = ngày thứ Hai
 * đầu tuần theo giờ Việt Nam ('YYYY-MM-DD').
 *
 * Giữ 120 ngày để còn so được vài tháng gần đây, rồi tự xoá.
 */
const tongKetTuanSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        tuan: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        lang: { type: String, enum: ['en', 'zh'], default: 'en' },
        tomTat: { type: String, default: '', maxlength: 600 },
        tienBo: { type: [String], default: [] },
        canLuyen: { type: [String], default: [] },
        // Việc tuần tới; `buoc` = khoá bước của Lộ trình hôm nay để mở thẳng chế độ.
        keHoach: {
            type: [{ viec: { type: String, maxlength: 200 }, buoc: { type: String, default: '' } }],
            default: [],
            _id: false,
        },
    },
    { timestamps: true, collection: 'tong_ket_tuan' },
);

tongKetTuanSchema.index({ userId: 1, tuan: 1, lang: 1 }, { unique: true });
tongKetTuanSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 * 24 * 3600 });

module.exports = mongoose.model('TongKetTuan', tongKetTuanSchema);
