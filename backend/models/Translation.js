const mongoose = require('mongoose');

/**
 * Một bài dịch Việt → Anh/Trung đã chấm.
 *
 * Giữ lại như `Essay`, không đặt TTL: người học cần đối chiếu bài cũ để thấy
 * mình có tiến bộ không — đó mới là giá trị chính của việc chấm điểm.
 */
const translationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        // Đoạn văn tiếng Việt (AI sinh) và chủ đề của nó.
        passage: { type: String, required: true },
        topic: { type: String, default: '' },

        /**
         * Các từ vựng đề bài được yêu cầu dùng tới.
         *
         * Lưu lại để về sau trả lời được câu "từ này mình đã gặp trong bài dịch
         * nào" — và để biết bộ từ nào hay sinh ra bài khó.
         */
        words: { type: [String], default: [] },

        level: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },

        translation: { type: String, required: true },
        // Với `lang: 'zh'` đây là số CHỮ HÁN, không phải số từ.
        unitCount: { type: Number, default: 0 },

        /** Ngôn ngữ ĐÍCH của bản dịch: 'en' hoặc 'zh'. Nguồn luôn là tiếng Việt. */
        lang: { type: String, enum: ['en', 'zh'], default: 'en', index: true },

        /**
         * Ba trục điểm + điểm tổng.
         *
         * Lưu riêng từng trục chứ không chỉ điểm tổng: cả ý nghĩa của chế độ này
         * nằm ở chỗ phân biệt được "sai ngữ pháp" với "đúng ngữ pháp nhưng
         * không ai nói thế". Chỉ có một con số thì đúng cái phân biệt đó mất.
         */
        scores: {
            accuracy: { type: Number, default: 0 },
            grammar: { type: Number, default: 0 },
            naturalness: { type: Number, default: 0 },
        },
        overall: { type: Number, default: 0, index: true },

        /** Bản dịch tham khảo của AI — thứ dạy nhiều nhất trong cả kết quả. */
        reference: { type: String, default: '' },

        /**
         * Các điểm cần sửa. `_id: false` vì đây là dữ liệu đọc kèm bài, không
         * bao giờ truy riêng từng ghi chú.
         */
        notes: {
            type: [{
                quote: { type: String, default: '' },
                issue: { type: String, default: '' },
                better: { type: String, default: '' },
            }],
            default: [],
            _id: false,
        },

        summary: { type: String, default: '' },

        /** Năng lượng đã trừ cho lần chấm này (0 nếu VIP). */
        energySpent: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Lịch sử luôn đọc theo "bài của tôi, mới nhất trước".
translationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Translation', translationSchema);
