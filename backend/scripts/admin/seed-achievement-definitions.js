/**
 * Seed achievement_definitions collection.
 * Safe to run multiple times — uses upsert by code.
 * Usage: node scripts/admin/seed-achievement-definitions.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const AchievementDefinition = require('../../models/AchievementDefinition');

const DEFINITIONS = [
    // Learning
    {
        code: 'learning1', name: 'Người mới bắt đầu',
        description: 'Học 10 từ vựng đầu tiên',
        icon: '📖', category: 'learning',
        conditionType: 'words-learned', conditionValue: 10,
        rewardCoins: 100, rewardXp: 0, rewardGems: 0,
        isActive: true, order: 1,
    },
    {
        code: 'learning2', name: 'Học sinh chăm chỉ',
        description: 'Học 50 từ vựng',
        icon: '🎓', category: 'learning',
        conditionType: 'words-learned', conditionValue: 50,
        rewardCoins: 300, rewardXp: 0, rewardGems: 5,
        isActive: true, order: 2,
    },
    {
        code: 'learning3', name: 'Bậc thầy từ vựng',
        description: 'Học 200 từ vựng',
        icon: '🏆', category: 'learning',
        conditionType: 'words-learned', conditionValue: 200,
        rewardCoins: 1000, rewardXp: 0, rewardGems: 20,
        isActive: true, order: 3,
    },

    // Practice
    {
        code: 'practice1', name: 'Tay mơ',
        description: 'Hoàn thành 5 bài luyện tập',
        icon: '🎮', category: 'practice',
        conditionType: 'total-sessions', conditionValue: 5,
        rewardCoins: 50, rewardXp: 0, rewardGems: 0,
        isActive: true, order: 10,
    },
    {
        code: 'practice2', name: 'Điểm số hoàn hảo',
        description: 'Đạt 10 vòng hoàn hảo (không sai)',
        icon: '⭐', category: 'practice',
        conditionType: 'perfect-rounds', conditionValue: 10,
        rewardCoins: 500, rewardXp: 0, rewardGems: 10,
        isActive: true, order: 11,
    },
    {
        code: 'practice3', name: 'Tốc độ ánh sáng',
        description: 'Trả lời 100 câu trong chế độ tốc độ',
        icon: '⚡', category: 'speed',
        conditionType: 'total-answers', conditionValue: 100,
        rewardCoins: 300, rewardXp: 0, rewardGems: 0,
        isActive: true, order: 12,
    },

    // Special / Streak
    {
        code: 'special1', name: 'Streaker',
        description: 'Học liên tục 7 ngày',
        icon: '🔥', category: 'streak',
        conditionType: 'streak', conditionValue: 7,
        rewardCoins: 500, rewardXp: 0, rewardGems: 15,
        isActive: true, order: 20,
    },
    {
        code: 'special2', name: 'Huyền thoại',
        description: 'Đạt level 50',
        icon: '👑', category: 'skill',
        conditionType: 'level', conditionValue: 50,
        rewardCoins: 0, rewardXp: 0, rewardGems: 100,
        isActive: true, order: 21,
    },
];

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    let created = 0, updated = 0;
    for (const def of DEFINITIONS) {
        const result = await AchievementDefinition.findOneAndUpdate(
            { code: def.code },
            { $set: def },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (result.createdAt?.getTime() === result.updatedAt?.getTime()) created++;
        else updated++;
        console.log(`  ✓ ${def.code} — ${def.name}`);
    }

    console.log(`\nDone: ${created} created, ${updated} updated`);
    await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
