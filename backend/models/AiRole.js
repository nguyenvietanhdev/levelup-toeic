const mongoose = require('mongoose');

/**
 * Vai của AI trong hội thoại, gắn với MỘT Part cụ thể (source + part + lang).
 *
 * Hai loại, cùng một bảng:
 *   · origin 'ai'   — AI đề xuất cho Part đó. DÙNG CHUNG cho mọi người dùng: gọi
 *                     AI một lần cho mỗi Part rồi lưu, nên không tốn token lại.
 *   · origin 'user' — người dùng tự viết. Chỉ của người đó, và THAY vai AI của
 *                     cùng Part khi người đó học Part ấy.
 *
 * Lưu rõ source và part để không nhầm giữa các đề: cùng tên Part ở hai đề khác
 * nhau là hai vai khác nhau.
 */
const aiRoleSchema = new mongoose.Schema(
    {
        source: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
        part: { type: String, required: true, trim: true, maxlength: 200 },
        lang: { type: String, enum: ['en', 'zh', 'bi'], default: 'en' },
        origin: { type: String, enum: ['ai', 'user'], required: true },
        // null với vai AI (dùng chung); userId với vai người dùng tự viết.
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        text: { type: String, required: true, trim: true, maxlength: 400 },
    },
    { timestamps: true, collection: 'ai_roles' },
);

// Mỗi Part chỉ có một vai AI dùng chung, và mỗi người chỉ có một vai riêng cho Part.
aiRoleSchema.index({ source: 1, part: 1, lang: 1, origin: 1, ownerId: 1 }, { unique: true });

module.exports = mongoose.model('AiRole', aiRoleSchema);
