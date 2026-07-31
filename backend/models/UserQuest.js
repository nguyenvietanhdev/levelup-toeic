const mongoose = require('mongoose');

const questEntrySchema = new mongoose.Schema(
    {
        questDefinitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestDefinition' },
        code:        { type: String, required: true },
        name:        { type: String, required: true },
        description: { type: String, default: '' },
        icon:        { type: String, default: '' },
        mode:        { type: String, default: 'any' },
        metric:      { type: String, default: '' },
        // Cache source/params từ def để evaluator không phải lookup mỗi lần.
        source:      { type: String, default: 'event' },
        params:      { type: mongoose.Schema.Types.Mixed, default: {} },
        target:      { type: Number, required: true },
        rewardCoins: { type: Number, default: 0 },
        rewardXp:    { type: Number, default: 0 },
        rewardGems:  { type: Number, default: 0 },
        rewardItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
        progress:    { type: Number, default: 0 },
        completed:   { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
        claimedAt:   { type: Date, default: null },
    },
    { _id: false }
);

const userQuestSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // 'daily' | 'weekly' | 'monthly' | 'special'
        questType: { type: String, required: true },
        // 'YYYY-MM-DD' | 'YYYY-WNN' | 'YYYY-MM' | definition code
        periodKey:  { type: String, required: true },

        // Baseline UserStats lúc tạo period — evaluator dùng để tính delta
        // ('correct-answers' = stats.totalCorrectAnswers - snapshot.totalCorrectAnswers).
        startSnapshot:  { type: mongoose.Schema.Types.Mixed, default: {} },
        // Mốc thời gian bắt đầu period — dùng cho evaluator filter theo ngày
        // (vd count ToeicAttempt từ periodStart trở đi).
        periodStart:    { type: Date, default: null },

        quests:         { type: [questEntrySchema], default: [] },
        totalCompleted: { type: Number, default: 0 },
        totalRewards: {
            xp:    { type: Number, default: 0 },
            coins: { type: Number, default: 0 },
            gems:  { type: Number, default: 0 },
        },
    },
    {
        timestamps: true,
        collection: 'user_quests',
        versionKey: false,
    }
);

userQuestSchema.index({ userId: 1, questType: 1, periodKey: 1 }, { unique: true });

module.exports = mongoose.model('UserQuest', userQuestSchema);
