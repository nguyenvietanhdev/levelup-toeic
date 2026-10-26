const mongoose = require('mongoose');

/**
 * MỘT LỖI CẦN ÔN — lấy từ chỗ đã chữa trong bài Viết, Dịch, Hội thoại.
 *
 * Kiểm tra lại qua các nấc (xem services/onLoi.js):
 *   0 Nhận ra (tìm chỗ sai trong câu cũ) → 1 Sửa được → 2 Hiểu vì sao (chọn lý do)
 *   → 3 Áp dụng (CÂU MỚI cùng loại lỗi, từ khác — chống học vẹt).
 * "Đã nắm" = qua nấc 3 ở ít nhất 2 NGÀY khác nhau. Làm đúng câu cũ nhưng sai câu mới
 * → "nghi học vẹt" và lùi một nấc.
 *
 * `khoa` = nguồn-bài-thứ tự, khớp `id` của Sổ tay lỗi — đồng bộ lại không tạo trùng
 * và không xoá tiến độ.
 */
const loiOnSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        khoa: { type: String, required: true, maxlength: 120 },
        lang: { type: String, enum: ['en', 'zh'], default: 'en' },
        nguon: { type: String, enum: ['viet', 'dich', 'noi'], required: true },
        // Câu gốc (của chính người học) chứa lỗi, chỗ sai, cách sửa, giải thích.
        cau: { type: String, required: true, maxlength: 400 },
        quote: { type: String, required: true, maxlength: 300 },
        sua: { type: String, required: true, maxlength: 300 },
        issue: { type: String, default: '', maxlength: 500 },
        loai: { type: String, default: 'other' },
        muc: { type: String, enum: ['loi', 'nen'], default: 'loi' },

        nac: { type: Number, default: 0, min: 0, max: 3 },
        // Bậc lịch ôn giãn cách (1 → 3 → 7 → 14 ngày) và ngày đến hạn.
        buoc: { type: Number, default: 0 },
        denHan: { type: Date, default: Date.now },
        // Các ngày (giờ VN, 'YYYY-MM-DD') đã qua nấc Áp dụng — đủ 2 ngày là đã nắm.
        ngayApDung: { type: [String], default: [] },
        daNam: { type: Boolean, default: false },
        nghiHocVet: { type: Boolean, default: false },
        // Câu mới đã gặp (id trong kho chung) — không lặp lại câu cũ.
        daGap: { type: [String], default: [] },
        lichSu: {
            type: [{ at: Date, dang: String, dung: Boolean, _id: false }],
            default: [],
        },
    },
    { timestamps: true, collection: 'loi_on' },
);

loiOnSchema.index({ userId: 1, khoa: 1 }, { unique: true });
loiOnSchema.index({ userId: 1, lang: 1, denHan: 1 });

module.exports = mongoose.model('LoiOn', loiOnSchema);
