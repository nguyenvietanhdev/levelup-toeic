const mongoose = require('mongoose');

const vocabularyUploadSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Auto-generated source key used to tag uploaded vocabularies
        // (matches Vocabulary.source / Vocabulary.uploadBatchId)
        source: { type: String, required: true, unique: true, trim: true },

        filename: { type: String, required: true },
        originalName: { type: String, default: '' },
        size: { type: Number, default: 0 },
        format: { type: String, default: '' },

        status: {
            type: String,
            enum: ['processing', 'active', 'expired', 'deleted', 'failed'],
            default: 'processing',
        },

        wordCount: { type: Number, default: 0 },
        normalizedCount: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 },

        uploadedAt: { type: Date, default: Date.now },
        // Auto-delete (TTL); null = never expire
        expiresAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'vocabulary_uploads',
        versionKey: false,
    }
);

vocabularyUploadSchema.index({ userId: 1, uploadedAt: -1 });
vocabularyUploadSchema.index({ status: 1 });
vocabularyUploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('VocabularyUpload', vocabularyUploadSchema);
