const mongoose = require('mongoose');

const userAchievementSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        achievementDefinitionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AchievementDefinition',
            required: true,
        },
        // Snapshot of definition code for fast lookup without join
        code: { type: String, required: true },

        unlockedAt: { type: Date, default: Date.now },

        claimedRewards: {
            xp: { type: Number, default: 0 },
            coins: { type: Number, default: 0 },
            gems: { type: Number, default: 0 },
        },
    },
    {
        timestamps: true,
        collection: 'user_achievements',
        versionKey: false,
    }
);

userAchievementSchema.index(
    { userId: 1, achievementDefinitionId: 1 },
    { unique: true }
);
userAchievementSchema.index({ userId: 1, unlockedAt: -1 });

module.exports = mongoose.model('UserAchievement', userAchievementSchema);
