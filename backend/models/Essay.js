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
        // Với `lang: 'zh'` đây là số CHỮ HÁN, không phải số từ — tiếng Trung
        // không đặt khoảng trắng giữa các từ nên đếm theo từ là vô nghĩa.
        wordCount: { type: Number, default: 0 },

        /**
         * Chuẩn chấm: 'en' = IELTS Task 2, 'zh' = HSK 书写.
         *
         * PHẢI lưu cùng bài: hai chuẩn có bộ tiêu chí khác nhau, nên đọc lại bài
         * cũ mà không biết nó chấm theo chuẩn nào thì không biết `scores` có
         * `lexical` hay `characters` — và hiển thị sẽ ra ô trống.
         */
        lang: { type: String, enum: ['en', 'zh'], default: 'en', index: true },

        /**
         * Bốn band tiêu chí + band tổng.
         *
         * Lưu RIÊNG từng tiêu chí chứ không chỉ band tổng: người học cần biết
         * mình yếu ở đâu. Chỉ có "6.5" thì không biết nên luyện từ vựng hay
         * ngữ pháp.
         */
        // Mixed: mỗi kiểu chấm có bộ khoá riêng (IELTS: taskResponse/lexical/...,
        // Giao tiếp: ro_y/tu_nhien/..., TOEIC: ngu_phap/mach_lac/...). Khai cứng từng
        // khoá thì Mongoose strict sẽ XOÁ ÂM THẦM điểm của kiểu chấm không khai.
        scores: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        // Kiểu chấm đã dùng. Bài cũ không có trường này: suy ra từ `lang` khi đọc.
        rubric: { type: String, default: '' },
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
