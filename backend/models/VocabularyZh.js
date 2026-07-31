const mongoose = require('mongoose');

const vocabularyZhSchema = new mongoose.Schema(
    {
        en: { type: String, trim: true, default: '' },
        vn: { type: String, trim: true, default: '' },
        zh: { type: String, required: true, trim: true },
        phonetic: { type: String, default: '' },
        part: { type: String, required: true, trim: true },
        synonyms: { type: String, default: '' },
        type: { type: String, default: '' },
        image: { type: String, default: '' },
        example: { type: String, default: '' },
        level: { type: String, default: '' },
        source: { type: String, required: true, trim: true },

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
        expiresAt: { type: Date, default: null },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'vocabularies_zh',
    }
);

vocabularyZhSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
vocabularyZhSchema.index(
    { zh: 1, part: 1, source: 1, vn: 1 },
    { unique: true, partialFilterExpression: { scope: 'public' } }
);
vocabularyZhSchema.index({ ownerEmail: 1, source: 1 });
vocabularyZhSchema.index({ ownerId: 1, scope: 1 });
vocabularyZhSchema.index({ source: 1, scope: 1 });
vocabularyZhSchema.index({ level: 1 });
vocabularyZhSchema.index({ type: 1 });
vocabularyZhSchema.index({ zh: 1, scope: 1 });
vocabularyZhSchema.index({ part: 1, scope: 1 });

module.exports = mongoose.model('VocabularyZh', vocabularyZhSchema);
