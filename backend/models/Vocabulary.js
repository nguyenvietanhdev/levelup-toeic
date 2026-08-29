const mongoose = require('mongoose');

const vocabularySchema = new mongoose.Schema(
    {
        en: { type: String, required: true, trim: true },
        vn: { type: String, trim: true, default: '' },
        phonetic: { type: String, default: '' },
        part: { type: String, required: true, trim: true },
        synonyms: { type: String, default: '' },
        // Phiên âm CỦA CHUỖI đồng nghĩa, cùng cơ chế cache như `examplePhonetic`.
        synonymsPhonetic: { type: String, default: '' },
        type: { type: String, default: '' },
        image: { type: String, default: '' },
        example: { type: String, default: '' },
        // Phiên âm CỦA CÂU ví dụ (IPA cho tiếng Anh, pinyin cho tiếng Trung).
        // Sinh bằng AI lúc cần rồi lưu lại: câu ví dụ là dữ liệu tĩnh nên phiên
        // âm của nó vĩnh viễn đúng — tính lại mỗi lần là trả tiền cho cùng một
        // câu mãi. Rỗng = chưa sinh bao giờ.
        examplePhonetic: { type: String, default: '' },
        level: { type: String, default: '' },
        source: { type: String, required: true, trim: true },

        // Ownership / scope
        scope: {
            type: String,
            enum: ['public', 'private'],
            default: 'public',
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        ownerEmail: {
            type: String,
            lowercase: true,
            default: null,
        },
        uploadBatchId: { type: String, default: '' },

        // Auto-delete for private docs (TTL via expiresAt; null = never expire)
        expiresAt: { type: Date, default: null },

        // Legacy: keep for backward compat with seeded data
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'vocabularies_en',
    }
);

// TTL: documents auto-delete when current time > expiresAt.
// Public docs (expiresAt = null) are never deleted.
vocabularySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Public: 1 word per (en, part, source, vn). Same word can appear as noun AND verb.
vocabularySchema.index(
    { en: 1, part: 1, source: 1, vn: 1 },
    { unique: true, partialFilterExpression: { scope: 'public' } }
);

// Personal: fast lookup by owner + source
vocabularySchema.index({ ownerEmail: 1, source: 1 });
vocabularySchema.index({ ownerId: 1, scope: 1 });

// Common filters
vocabularySchema.index({ source: 1, scope: 1 });
vocabularySchema.index({ level: 1 });
vocabularySchema.index({ type: 1 });
// Text search optimization
vocabularySchema.index({ en: 1, scope: 1 });
vocabularySchema.index({ part: 1, scope: 1 });

module.exports = mongoose.model('Vocabulary', vocabularySchema);
