const mongoose = require('mongoose');

const questDefinitionSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        icon: { type: String, default: '' },

        type: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'special'],
            default: 'daily',
        },
        // Target game mode, or 'any' for cross-mode quests
        mode: { type: String, default: 'any' },

        // Chỉ số tiến độ (progressType) nhiệm vụ này theo dõi. Khớp với
        // Quest.updateProgress ở frontend: complete-games | correct-answers
        // | learn-words | earn-xp | daily-streak | perfect-rounds | play-mode
        // Để trống '' = suy theo tiền tố `code` cũ (tương thích ngược).
        metric: { type: String, default: '' },

        // Cách tính tiến độ:
        //  - 'event'    : tăng dần qua Quest.updateProgress() từ client (legacy)
        //  - 'computed' : server đọc thẳng UserStats / DB tại getQuests/claim
        //    và so với startSnapshot. Robust hơn — không phụ thuộc client emit.
        source: {
            type: String,
            enum: ['event', 'computed'],
            default: 'computed',
        },

        // Tham số phụ cho evaluator (vd { mode: 'speed-quiz' } cho play-mode).
        params: { type: mongoose.Schema.Types.Mixed, default: {} },

        target: { type: Number, required: true, min: 1 },

        rewardCoins: { type: Number, default: 0 },
        rewardXp:    { type: Number, default: 0 },
        rewardGems:  { type: Number, default: 0 },
        // Thưởng thêm vật phẩm inventory: [{ itemId, quantity }] (vd vé quay).
        rewardItems: { type: [mongoose.Schema.Types.Mixed], default: [] },

        isActive: { type: Boolean, default: true },
        // Higher weight = more likely to be selected when generating daily quests
        weight: { type: Number, default: 1 },
    },
    {
        timestamps: true,
        collection: 'quest_definitions',
    }
);

questDefinitionSchema.index({ type: 1, isActive: 1 });

module.exports = mongoose.model('QuestDefinition', questDefinitionSchema);
