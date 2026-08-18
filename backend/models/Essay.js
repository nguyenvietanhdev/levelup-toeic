const mongoose = require('mongoose');

/**
 * Bài viết luận đã chấm.
 *
 * KHÔNG có TTL: khác chế độ Hội thoại (phiên bỏ dở tự xoá sau 7 ngày), bài viết
 * là thứ người học bỏ công 40 phút ra làm. Giữ lại để họ đối chiếu bài cũ và
 * thấy band có lên không — đó mới là giá trị chính của việc chấm.
 */
const essaySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        // Đề bài (AI sinh) và loại câu hỏi Task 2.
        prompt: { type: String, required: true },
        promptType: { type: String, default: '' },
        // Bộ từ gợi ý cho đề — để về sau lọc "bài viết theo chủ đề nào".
        topicHint: { type: String, default: '' },

        essay: { type: String, required: true },
        wordCount: { type: Number, default: 0 },

        /**
         * Bốn band tiêu chí + band tổng.
         *
         * Lưu RIÊNG từng tiêu chí chứ không chỉ band tổng: người học cần biết
         * mình yếu ở đâu. Chỉ có "6.5" thì không biết nên luyện từ vựng hay
         * ngữ pháp.
         */
        scores: {
            taskResponse: { type: Number, default: 0 },
            coherence: { type: Number, default: 0 },
            lexical: { type: Number, default: 0 },
            grammar: { type: Number, default: 0 },
        },
        overall: { type: Number, default: 0, index: true },

        // Nhận xét từng tiêu chí (tiếng Việt).
        comments: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        // Lỗi cụ thể: { quote, issue, fix }. Mixed vì hình dạng do AI trả.
        //
        // Tên `issues` chứ KHÔNG phải `errors`: `errors` là tên DÀNH RIÊNG của
        // Mongoose (`Document.prototype.errors` giữ lỗi validate). Dùng nó thì
        // Mongoose cảnh báo và có thể vỡ chỗ khác — đúng loại hỏng im lặng.
        issues: { type: [mongoose.Schema.Types.Mixed], default: [] },
        strengths: { type: [String], default: [] },
        // Một đoạn được viết lại làm mẫu.
        improved: { type: String, default: '' },

        // Thưởng đã nhận. `claimed` chặn cộng hai lần — cùng lỗ hổng với
        // `finish` của Hội thoại.
        reward: {
            xp: { type: Number, default: 0 },
            coins: { type: Number, default: 0 },
            claimed: { type: Boolean, default: false },
        },
    },
    {
        timestamps: true,
        collection: 'essays',
        versionKey: false,
    }
);

// Màn "bài viết của tôi", mới nhất trước — truy vấn hay dùng nhất.
essaySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Essay', essaySchema);
