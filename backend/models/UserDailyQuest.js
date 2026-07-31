const mongoose = require('mongoose');

const questEntrySchema = new mongoose.Schema(
    {
        questDefinitionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'QuestDefinition',
            required: true,
        },
        // Snapshot of the definition at assignment time
        // (so quest doesn't break if definition is later edited/deleted)
        code: { type: String, required: true },
        name: { type: String, required: true },
        icon: { type: String, default: '' },
        mode: { type: String, default: 'any' },
        target: { type: Number, required: true },
        rewardCoins: { type: Number, default: 0 },
        rewardXp: { type: Number, default: 0 },

        progress: { type: Number, default: 0 },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
        claimedAt: { type: Date, default: null },
    },
    { _id: false }
);

const userDailyQuestSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // YYYY-MM-DD (user's local date when quests were generated)
        date: { type: String, required: true },

        quests: { type: [questEntrySchema], default: [] },

        totalCompleted: { type: Number, default: 0 },
        totalRewards: {
            xp: { type: Number, default: 0 },
            coins: { type: Number, default: 0 },
        },
    },
    {
        timestamps: true,
        collection: 'user_daily_quests',
        versionKey: false,
    }
);

userDailyQuestSchema.index({ userId: 1, date: -1 }, { unique: true });

module.exports = mongoose.model('UserDailyQuest', userDailyQuestSchema);
