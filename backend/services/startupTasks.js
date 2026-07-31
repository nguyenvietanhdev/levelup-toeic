const logger = require('../utils/logger');

// Tạo UserProfile/UserStats còn thiếu cho các account tạo trước khi tách model
async function migrateUserDependents() {
    try {
        const User        = require('../models/User');
        const UserProfile = require('../models/UserProfile');
        const UserStats   = require('../models/UserStats');

        const users = await User.find({}).select('_id email').lean();
        let created = 0;

        for (const u of users) {
            const [profile, stats] = await Promise.all([
                UserProfile.findOne({ userId: u._id }).lean(),
                UserStats.findOne({ userId: u._id }).lean(),
            ]);

            if (!profile) {
                const base = u.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').substring(0, 18) || 'user';
                const exists = await UserProfile.findOne({ username: base }).lean();
                const username = exists ? base + '_' + String(u._id).slice(-4) : base;
                await UserProfile.create({ userId: u._id, username, displayName: username, avatar: username.charAt(0).toUpperCase() });
                created++;
            }
            if (!stats) {
                await UserStats.create({ userId: u._id });
                created++;
            }
        }

        if (created > 0) logger.info(`Migration: created ${created} missing UserProfile/UserStats documents`);
    } catch (err) {
        logger.warn('Migration migrateUserDependents failed (non-fatal):', err.message);
    }
}

// Seed danh sách thành tựu mặc định nếu collection còn trống
async function seedAchievementDefinitions() {
    try {
        const AchievementDefinition = require('../models/AchievementDefinition');
        const count = await AchievementDefinition.countDocuments();
        if (count > 0) return; // already seeded

        const DEFINITIONS = [
            { code: 'learning1', name: 'Người mới bắt đầu', description: 'Học 10 từ vựng đầu tiên', icon: '📖', category: 'learning', conditionType: 'words-learned', conditionValue: 10, rewardCoins: 100, rewardXp: 0, rewardGems: 0, isActive: true, order: 1 },
            { code: 'learning2', name: 'Học sinh chăm chỉ', description: 'Học 50 từ vựng', icon: '🎓', category: 'learning', conditionType: 'words-learned', conditionValue: 50, rewardCoins: 300, rewardXp: 0, rewardGems: 5, isActive: true, order: 2 },
            { code: 'learning3', name: 'Bậc thầy từ vựng', description: 'Học 200 từ vựng', icon: '🏆', category: 'learning', conditionType: 'words-learned', conditionValue: 200, rewardCoins: 1000, rewardXp: 0, rewardGems: 20, isActive: true, order: 3 },
            { code: 'practice1', name: 'Tay mơ', description: 'Hoàn thành 5 bài luyện tập', icon: '🎮', category: 'practice', conditionType: 'total-sessions', conditionValue: 5, rewardCoins: 50, rewardXp: 0, rewardGems: 0, isActive: true, order: 10 },
            { code: 'practice2', name: 'Điểm số hoàn hảo', description: 'Đạt 10 vòng hoàn hảo (không sai)', icon: '⭐', category: 'practice', conditionType: 'perfect-rounds', conditionValue: 10, rewardCoins: 500, rewardXp: 0, rewardGems: 10, isActive: true, order: 11 },
            { code: 'practice3', name: 'Tốc độ ánh sáng', description: 'Trả lời 100 câu trong chế độ tốc độ', icon: '⚡', category: 'speed', conditionType: 'total-answers', conditionValue: 100, rewardCoins: 300, rewardXp: 0, rewardGems: 0, isActive: true, order: 12 },
            { code: 'special1', name: 'Streaker', description: 'Học liên tục 7 ngày', icon: '🔥', category: 'streak', conditionType: 'streak', conditionValue: 7, rewardCoins: 500, rewardXp: 0, rewardGems: 15, isActive: true, order: 20 },
            { code: 'special2', name: 'Huyền thoại', description: 'Đạt level 50', icon: '👑', category: 'skill', conditionType: 'level', conditionValue: 50, rewardCoins: 0, rewardXp: 0, rewardGems: 100, isActive: true, order: 21 },
        ];

        await AchievementDefinition.insertMany(DEFINITIONS);
        logger.info(`Seeded ${DEFINITIONS.length} achievement definitions`);
    } catch (err) {
        logger.warn('seedAchievementDefinitions failed (non-fatal):', err.message);
    }
}

module.exports = { migrateUserDependents, seedAchievementDefinitions };
