const mongoose = require('mongoose');

/**
 * Dạng bài AI gợi ý là HỢP với bộ từ của một Part, cho một chế độ AI.
 *
 * Mỗi (chế độ, source, part, lang, scope) chỉ gọi AI MỘT lần rồi lưu lại — mở
 * lại màn là có ngay, không tốn token. `scope` = '' với đề chung (dùng chung mọi
 * người), = email với bộ từ riêng tải lên (hai người có thể đặt trùng tên đề).
 *
 * Hết hạn sau 30 ngày để gợi ý tự làm mới khi kho dạng bài được sửa.
 */
const dangGoiYSchema = new mongoose.Schema(
    {
        mode: { type: String, enum: ['reading', 'essay', 'translation', 'listening', 'conversation'], required: true },
        source: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
        part: { type: String, required: true, trim: true, maxlength: 200 },
        lang: { type: String, enum: ['en', 'zh', 'bi'], default: 'en' },
        scope: { type: String, default: '', maxlength: 200 },
        // Khoá dạng bài trong kho của chế độ đó, theo thứ tự hợp nhất trước.
        keys: { type: [String], default: [] },
    },
    { timestamps: true, collection: 'dang_goi_y' },
);

dangGoiYSchema.index({ mode: 1, source: 1, part: 1, lang: 1, scope: 1 }, { unique: true });
dangGoiYSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports = mongoose.model('DangGoiY', dangGoiYSchema);
