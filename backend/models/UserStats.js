const mongoose = require('mongoose');

const modeStatSchema = new mongoose.Schema(
    {
        played: { type: Number, default: 0 },
        score: { type: Number, default: 0 },
        correct: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
    },
    { _id: false }
);

const userStatsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },

        // XP & Level progression
        xp: { type: Number, default: 0 },
        totalXp: { type: Number, default: 0 },

        // Resources
        coins: { type: Number, default: 0 },
        gems: { type: Number, default: 0 },
        energy: { type: Number, default: 100 },
        maxEnergy: { type: Number, default: 100 },
        lastEnergyUpdate: { type: Date, default: Date.now },

        // Inventory
        hints: { type: Number, default: 0 },
        shields: { type: Number, default: 0 },
        timeFreezes: { type: Number, default: 0 },

        // Streak
        streakCurrent: { type: Number, default: 0 },
        streakLongest: { type: Number, default: 0 },
        streakLastPlayDate: { type: Date, default: null },
        streakShieldsUsed: { type: Number, default: 0 },

        // Aggregate progress
        wordsLearned: { type: [String], default: [] },
        wordsMastered: { type: [String], default: [] },
        totalSessions: { type: Number, default: 0 },
        totalGamesPlayed: { type: Number, default: 0 },
        totalQuestionsAnswered: { type: Number, default: 0 },
        totalCorrectAnswers: { type: Number, default: 0 },
        totalWrongAnswers: { type: Number, default: 0 },
        perfectRounds: { type: Number, default: 0 },
        highestScore: { type: Number, default: 0 },
        totalPlayTime: { type: Number, default: 0 },

        // Per-mode breakdown
        modeStats: {
            type: Map,
            of: modeStatSchema,
            default: () => new Map(),
        },

        // Lần mua gần nhất theo itemId — dùng cho vật phẩm giới hạn theo chu kỳ
        // (vd Gói Khiên Bảo Vệ: 1 lần / tuần).
        shopCooldowns: {
            type: Map,
            of: Date,
            default: () => new Map(),
        },

        // Active boosts
        xpBoostActive: { type: Boolean, default: false },
        xpBoostMultiplier: { type: Number, default: 1 },
        xpBoostExpiresAt: { type: Date, default: null },
        coinsBoostActive: { type: Boolean, default: false },
        coinsBoostMultiplier: { type: Number, default: 1 },
        coinsBoostExpiresAt: { type: Date, default: null },
        // Tăng TỐC ĐỘ HỒI năng lượng (x2/x3) — không phải cộng thẳng ⚡, nên
        // trần maxEnergy vẫn chặn: boost chỉ rút ngắn thời gian chờ.
        energyBoostActive: { type: Boolean, default: false },
        energyBoostMultiplier: { type: Number, default: 1 },
        energyBoostExpiresAt: { type: Date, default: null },

        // VIP: hết hạn = null/đã qua. Khi còn hạn → năng lượng không trừ + x2 XP/Coins.
        vipExpiresAt: { type: Date, default: null },

        // Lịch sử CHI TIÊU (chỉ mua shop/đổi gems/VIP) — mảng giới hạn 50 mục
        // gần nhất (newest first) để giữ nhẹ. Mỗi mục: { at, itemId, name,
        // amount, currency, balanceAfter }.
        transactions: { type: [mongoose.Schema.Types.Mixed], default: [] },

        // Daily practice history (last 90 days)
        practiceHistory: [{
            date: { type: String, required: true },
            sessionsCompleted: { type: Number, default: 0 },
            questionsAnswered: { type: Number, default: 0 },
            correctAnswers: { type: Number, default: 0 },
            totalXpEarned: { type: Number, default: 0 },
            totalCoinsEarned: { type: Number, default: 0 },
            timeSpent: { type: Number, default: 0 },
        }],
    },
    {
        timestamps: true,
        collection: 'user_stats',
        versionKey: false,
    }
);

userStatsSchema.index({ totalXp: -1 });
userStatsSchema.index({ highestScore: -1 });
userStatsSchema.index({ streakCurrent: -1 });
userStatsSchema.index({ userId: 1, totalXp: -1 });
userStatsSchema.index({ userId: 1, highestScore: -1 });

module.exports = mongoose.model('UserStats', userStatsSchema);
