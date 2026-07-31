const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema(
    {
        sourceKeys: {
            type: [String],
            required: true,
            validate: {
                validator: (v) => Array.isArray(v) && v.length > 0,
                message: 'Phải có ít nhất một sourceKey',
            },
            index: true,
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
        },
        icon: {
            type: String,
            default: '📚',
        },
        color: {
            type: String,
            default: '#3b82f6',
        },
        order: {
            type: Number,
            default: 0,
        },
        isPublic: {
            type: Boolean,
            default: true,
        },
        wordCount: {
            type: Number,
            default: 0,
        },
        lang: {
            type: String,
            enum: ['en', 'zh'],
            default: 'en',
        },
    },
    {
        timestamps: true,
        collection: 'vocabularies_topics',
    }
);

topicSchema.index({ isPublic: 1, order: 1 });
topicSchema.index({ sourceKeys: 1 });

module.exports = mongoose.model('Topic', topicSchema);
