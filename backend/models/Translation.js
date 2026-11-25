const mongoose = require('mongoose');
const { MA_NGON_NGU } = require('../config/ngonNgu');

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

        /** Ngoại ngữ của cặp dịch: 'en' hoặc 'zh' (bên kia luôn là tiếng Việt). */
        lang: { type: String, enum: MA_NGON_NGU, default: 'en', index: true },
        /**
         * Chiều dịch. 'vi-ngoai' (mặc định, bài cũ): Việt → Anh/Trung, đo VIẾT. 'ngoai-vi':
         * Anh/Trung → Việt, đo ĐỌC HIỂU — ba trục điểm khác, và ghi chú là lỗi HIỂU chứ không phải
         * lỗi viết, nên Sổ tay lỗi / Ôn lỗi / hồ sơ ngữ pháp bỏ qua loại bài này.
         */
        chieu: { type: String, enum: ['vi-ngoai', 'ngoai-vi'], default: 'vi-ngoai' },

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
            // Chiều ngược (đọc hiểu).
            comprehension: { type: Number },
            completeness: { type: Number },
            expression: { type: Number },
        },
        /** Chiều ngược: cụm ngoại ngữ người học hiểu sai, kèm nghĩa đúng và câu gốc (để lưu ôn). */
        hieuSai: {
            type: [{ cum: String, nghia: String, cau: String, _id: false }],
            default: [],
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
                // Chiều ngược: cụm ngoại ngữ trong bản gốc mà ghi chú nói tới.
                nguon: { type: String, default: '' },
                // Nhóm lỗi, để thống kê được "hay sai gì nhất". Mongoose ở chế
                // độ `strict` XOÁ ÂM THẦM trường chưa khai — thiếu dòng này thì
                // nhãn AI gán bị mất sạch mà không lỗi nào báo.
                //
                // Tên `loai` chứ KHÔNG phải `type`: `type` là từ khoá Mongoose
                // dùng để khai kiểu dữ liệu. Ở đây nó vẫn chạy vì được bọc
                // trong object, nhưng một lần đơn giản hoá thành `type: String`
                // là trường biến mất — cùng loại bẫy đã khiến `errors` phải đổi
                // tên thành `issues` trong Essay.
                loai: { type: String, default: 'other' },
                // Mức độ khi chữa bài: 'loi' (sai) / 'nen' (nên sửa cho tự nhiên).
                // Khai rõ vì chế độ `strict` xoá âm thầm trường chưa khai.
                muc: { type: String, enum: ['loi', 'nen'], default: 'loi' },
            }],
            default: [],
            _id: false,
        },

        summary: { type: String, default: '' },
        // Các lần NỘP LẠI BÀI ĐÃ SỬA để AI xem lại (tối đa 3): bài sửa + lỗi nào đã hết.
        // Không điểm, không XP — chỉ để người học biết mình sửa đúng chưa.
        xemLai: { type: [mongoose.Schema.Types.Mixed], default: [] },

        /** Năng lượng đã trừ cho lần chấm này (0 nếu VIP). */
        energySpent: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Lịch sử luôn đọc theo "bài của tôi, mới nhất trước".
translationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Translation', translationSchema);
