const mongoose = require('mongoose');

/**
 * Vai của AI trong hội thoại, gắn với MỘT Part cụ thể (source + part + lang).
 *
 * Hai loại, cùng một bảng:
 *   · origin 'ai'   — vai AI đã LƯU cho Part đó (người học bấm "Lưu vai AI").
 *                     Dùng chung cho mọi người. Mỗi Part có nhiều vai AI đã lưu,
 *                     vai mới nhất là vai đang dùng. Không trùng nội dung.
 *   · origin 'user' — người dùng tự viết. Chỉ của người đó, và THAY vai AI của
 *                     cùng Part khi người đó học Part ấy.
 *
 * Lưu rõ source và part để không nhầm giữa các đề.
 */
const aiRoleSchema = new mongoose.Schema(
    {
        source: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
        part: { type: String, required: true, trim: true, maxlength: 200 },
        lang: { type: String, enum: ['en', 'zh', 'bi'], default: 'en' },
        origin: { type: String, enum: ['ai', 'user'], required: true },
        // null với vai AI (dùng chung); userId với vai người dùng tự viết.
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        // Tiêu đề ngắn (vd "Barista at a café") để người học nhận ra vai.
        title: { type: String, default: '', trim: true, maxlength: 80 },
        // Mô tả ngắn: AI đóng vai ai, nói với ai. Đây là phần đi vào prompt hội thoại.
        text: { type: String, required: true, trim: true, maxlength: 400 },
        // Dấu vân tay của tiêu đề + mô tả đã chuẩn hoá: dùng để không lưu trùng vai AI.
        hash: { type: String, default: null },
    },
    { timestamps: true, collection: 'ai_roles' },
);

// Vai riêng: mỗi người chỉ một vai riêng cho mỗi Part.
aiRoleSchema.index(
    { source: 1, part: 1, lang: 1, ownerId: 1 },
    { unique: true, partialFilterExpression: { origin: 'user' } },
);
// Vai AI đã lưu: không trùng nội dung trong cùng một Part.
aiRoleSchema.index(
    { source: 1, part: 1, lang: 1, hash: 1 },
    { unique: true, partialFilterExpression: { origin: 'ai' } },
);

module.exports = mongoose.model('AiRole', aiRoleSchema);
