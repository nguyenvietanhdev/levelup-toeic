const mongoose = require('mongoose');

/**
 * Một lượt làm bài ĐỌC HIỂU Part 7 đã chấm.
 *
 * Giữ lại như `Essay`/`Translation`, không TTL: người học cần đối chiếu để thấy
 * tỉ lệ đúng có lên không — đó là giá trị chính của việc lưu điểm.
 */
const readingAttemptSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        title: { type: String, default: '' },
        passage: { type: String, required: true },
        /** Dạng văn bản: email · notice · advertisement · article · memo · schedule. */
        dang: { type: String, default: 'email' },
        level: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
        /**
         * Ngôn ngữ của bài đọc: 'en' = TOEIC Part 7, 'zh' = HSK 阅读.
         *
         * PHẢI lưu cùng bài: hai chuẩn có độ dài và dạng văn bản khác nhau, nên
         * đọc lại lịch sử mà không biết bài thuộc chuẩn nào thì không so sánh
         * được điểm giữa các lượt.
         */
        lang: { type: String, enum: ['en', 'zh'], default: 'en', index: true },
        /** Các từ đề bài được yêu cầu dùng tới. */
        words: { type: [String], default: [] },

        /**
         * Từng câu: đề, đáp án đúng, người học chọn gì.
         *
         * Lưu CẢ câu hỏi chứ không chỉ đúng/sai: bài do AI sinh nên không có ở
         * đâu khác — không lưu thì mở lại lịch sử chỉ thấy "3/4" mà không biết
         * mình đã sai câu nào.
         *
         * `_id: false` vì đây là dữ liệu đọc kèm lượt làm, không truy riêng.
         */
        questions: {
            type: [{
                question: { type: String, default: '' },
                options: { type: [String], default: [] },
                answer: { type: String, default: '' },
                chose: { type: String, default: '' },
                correct: { type: Boolean, default: false },
                explain: { type: String, default: '' },
            }],
            default: [],
            _id: false,
        },

        correct: { type: Number, default: 0 },
        total: { type: Number, default: 0 },

        /** Năng lượng đã trừ cho lượt này (0 nếu VIP). */
        energySpent: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Lịch sử luôn đọc theo "bài của tôi, mới nhất trước".
readingAttemptSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ReadingAttempt', readingAttemptSchema);
