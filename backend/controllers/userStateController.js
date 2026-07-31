const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const UserAchievement = require('../models/UserAchievement');
const UserDailyQuest = require('../models/UserDailyQuest');
const AchievementDefinition = require('../models/AchievementDefinition');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const { buildFullState, applyEnergyRegen, applyLevelUp, awardXp } = require('../utils/userStateHelper');
const Inventory = require('../services/inventoryService');
const ItemDefinition = require('../models/ItemDefinition');
const { logTxn } = require('../utils/economyLog');

function expireBoosts(stats) {
    const now = Date.now();
    if (stats.xpBoostActive && stats.xpBoostExpiresAt && new Date(stats.xpBoostExpiresAt).getTime() <= now) {
        stats.xpBoostActive = false;
        stats.xpBoostMultiplier = 1;
        stats.xpBoostExpiresAt = null;
    }
    if (stats.coinsBoostActive && stats.coinsBoostExpiresAt && new Date(stats.coinsBoostExpiresAt).getTime() <= now) {
        stats.coinsBoostActive = false;
        stats.coinsBoostMultiplier = 1;
        stats.coinsBoostExpiresAt = null;
    }
}

// getShopItems / purchaseItem moved to controllers/shopController.js (P4).

exports.getState = async (req, res, next) => {
    try {
        const userId = req.user.id;
        let [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId }),
            UserStats.findOne({ userId }),
        ]);

        if (!profile || !stats) {
            const user = await User.findById(userId).select('email').lean();
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            const base = user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').substring(0, 18) || 'user';
            if (!profile) {
                const exists = await UserProfile.findOne({ username: base }).lean();
                const username = exists ? base + '_' + Date.now().toString().slice(-4) : base;
                profile = await UserProfile.create({ userId, username, displayName: username, avatar: username.charAt(0).toUpperCase() });
            }
            if (!stats) stats = await UserStats.create({ userId });
        }

        applyEnergyRegen(stats);
        expireBoosts(stats);
        await stats.save();

        const gameState = await buildFullState(req.user.id);
        res.json({ success: true, data: gameState });
    } catch (error) {
        logger.error('Error in getState:', error);
        next(error);
    }
};

exports.saveState = async (req, res, next) => {
    try {
        const state = req.body;
        const userId = req.user.id;

        let [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId }),
            UserStats.findOne({ userId }),
        ]);

        // Auto-create for accounts that pre-date the schema restructure
        if (!profile || !stats) {
            const user = await User.findById(userId).select('email').lean();
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });

            if (!profile) {
                const base = (state.user?.username || user.email.split('@')[0])
                    .replace(/[^a-zA-Z0-9_]/g, '').substring(0, 18) || 'user';
                const exists = await UserProfile.findOne({ username: base }).lean();
                const username = exists ? base + '_' + Date.now().toString().slice(-4) : base;
                profile = await UserProfile.create({
                    userId,
                    username,
                    displayName: state.user?.displayName || username,
                    avatar: state.user?.avatar || username.charAt(0).toUpperCase(),
                });
            }
            if (!stats) {
                stats = await UserStats.create({ userId });
            }
        }

        // ⚠️ SERVER-AUTHORITATIVE ECONOMY: KHÔNG tin client về tiền tệ.
        // level/xp/totalXp/coins/gems/hints/shields/timeFreezes và các counter
        // tổng (games/correct/wrong/perfect/score/playTime/modeStats) CHỈ được
        // ghi bởi các endpoint server đã xác thực (/practice/submit, /shop/purchase,
        // quest claim, achievement, checkin, toeic submit...). saveState bỏ qua
        // hết — nếu không client có thể tự bơm coins/XP/level/khiên.
        // Các field KHÔNG phải tiền tệ vẫn nhận từ client bên dưới.

        // User / profile fields — avatar đổi qua POST /api/auth/avatar; level do server.
        // (state.user.level/xp/totalXp: bỏ qua — server-authoritative)

        // Resources — chỉ energy (giới hạn lượt chơi) còn nhận từ client.
        // Tiền tệ (coins/gems/hints/shields/timeFreezes): bỏ qua — server-authoritative.
        if (state.resources) {
            if (state.resources.energy !== undefined) stats.energy = state.resources.energy;
            if (state.resources.maxEnergy !== undefined) stats.maxEnergy = state.resources.maxEnergy;
            if (state.resources.lastEnergyUpdate) stats.lastEnergyUpdate = new Date(state.resources.lastEnergyUpdate);
        }

        // Progress — chỉ danh sách từ (không phải tiền tệ). Các counter tổng
        // và modeStats do /practice/submit cập nhật → bỏ qua ở đây để khỏi
        // double-count / bị client ghi đè.
        if (state.progress) {
            if (state.progress.wordsLearned) stats.wordsLearned = state.progress.wordsLearned;
            if (state.progress.wordsMastered) stats.wordsMastered = state.progress.wordsMastered;
        }

        // Streak: KHÔNG ghi từ blob client ở đây. Streak do /practice/submit
        // tính độc quyền (nguồn sự thật duy nhất). Trước đây saveState chạy ở
        // rất nhiều hành động (settings, mua đồ, save nền…) và ghi đè streak +
        // lastPlayDate bằng giá trị client có thể bị cũ → đẩy lastPlayDate lùi
        // lại → lần chơi sau daysDiff > 1 → streak bị reset về 1.

        // Quests — upsert today's UserDailyQuest
        if (state.quests?.daily && Array.isArray(state.quests.daily)) {
            const today = new Date().toISOString().split('T')[0];
            const completed = state.quests.daily.filter(q => q.completed);
            await UserDailyQuest.findOneAndUpdate(
                { userId, date: today },
                {
                    $set: {
                        quests: state.quests.daily,
                        totalCompleted: completed.length,
                    },
                },
                { upsert: true }
            );
        }

        // Achievements — upsert newly unlocked ones
        if (state.achievements && Array.isArray(state.achievements)) {
            // Accept both new-style (unlocked: true) and old-style (only unlockedAt set)
            const unlocked = state.achievements.filter(a => a.unlocked || a.unlockedAt);
            if (unlocked.length) {
                const codes = unlocked.map(a => a.id);
                const defs = await AchievementDefinition.find({ code: { $in: codes } });
                const defMap = new Map(defs.map(d => [d.code, d]));

                await Promise.all(
                    unlocked.map(a => {
                        const def = defMap.get(a.id);
                        if (!def) return null;
                        return UserAchievement.findOneAndUpdate(
                            { userId, code: a.id },
                            {
                                $setOnInsert: {
                                    userId,
                                    achievementDefinitionId: def._id,
                                    code: a.id,
                                    unlockedAt: a.unlockedAt ? new Date(a.unlockedAt) : new Date(),
                                    claimedRewards: { xp: def.rewardXp, coins: def.rewardCoins, gems: def.rewardGems },
                                },
                            },
                            { upsert: true, new: false }
                        );
                    }).filter(Boolean)
                );
            }
        }

        // Boosts: KHÔNG ghi từ client — boost chỉ kích hoạt khi mua ở shop
        // (applyShopEffect case 'boost', server-side) và tự hết hạn (expireBoosts).
        // Nếu nhận từ client → ai cũng tự bật x2 XP/coins vĩnh viễn miễn phí.

        // Settings
        if (state.settings) {
            Object.assign(profile.settings, state.settings);
            profile.markModified('settings');
        }

        // Practice history
        if (state.practiceHistory && Array.isArray(state.practiceHistory)) {
            stats.practiceHistory = state.practiceHistory;
        }

        await Promise.all([profile.save(), stats.save()]);

        const gameState = await buildFullState(userId);
        res.json({ success: true, message: 'State saved successfully', data: gameState });
    } catch (error) {
        logger.error('Error in saveState:', error);
        next(error);
    }
};

// ⛔ DEPRECATED & KHÓA: endpoint này từng cho client set thẳng tiền tệ → lỗ cheat.
// Tài nguyên giờ server-authoritative (cấp qua /practice/submit, /shop/purchase,
// quest/achievement/checkin claim...). Không client nào còn gọi route này.
exports.updateResources = async (req, res) => {
    return res.status(403).json({
        success: false,
        message: 'Endpoint đã bị khóa: tài nguyên do server quản lý (server-authoritative).',
    });
};

// ⛔ DEPRECATED & KHÓA: client set counter tổng (correct/games...) → cheat tiến độ
// nhiệm vụ (quest đọc các counter này để cấp thưởng). Counter giờ do server cập
// nhật qua /practice/submit. Riêng wordsLearned/wordsMastered đi qua POST /state.
exports.updateProgress = async (req, res) => {
    return res.status(403).json({
        success: false,
        message: 'Endpoint đã bị khóa: tiến độ do server cập nhật (server-authoritative).',
    });
};

// ⛔ DEPRECATED & KHÓA: cho client tự cộng XP tùy ý → lỗ cheat. XP giờ chỉ được
// cấp bởi /practice/submit (có cap mỗi câu) và các luồng thưởng server khác.
exports.addXp = async (req, res) => {
    return res.status(403).json({
        success: false,
        message: 'Endpoint đã bị khóa: XP do server cấp (server-authoritative).',
    });
};

exports.unlockAchievement = async (req, res, next) => {
    try {
        const { achievementId } = req.body;
        if (!achievementId) return res.status(400).json({ success: false, message: 'Achievement ID is required' });

        const userId = req.user.id;

        // Check already unlocked
        const existing = await UserAchievement.findOne({ userId, code: achievementId });
        if (existing) return res.status(400).json({ success: false, message: 'Achievement already unlocked' });

        // Find definition
        const def = await AchievementDefinition.findOne({ code: achievementId, isActive: true });
        if (!def) return res.status(404).json({ success: false, message: 'Achievement not found' });

        const stats = await UserStats.findOne({ userId });
        if (!stats) return res.status(404).json({ success: false, message: 'User not found' });
        const profile = await UserProfile.findOne({ userId });

        // Grant rewards
        if (def.rewardCoins) stats.coins += def.rewardCoins;
        // Cộng XP có áp lên cấp ngay (giữ level khớp xp) — xem awardXp.
        if (def.rewardXp && profile) awardXp(profile, stats, def.rewardXp);
        if (def.rewardGems) stats.gems += def.rewardGems;
        const achName = `Thành tích: ${def.name}`;
        if (def.rewardCoins) logTxn(userId, { type: 'achievement', direction: 'in', name: achName, amount: def.rewardCoins, currency: 'coins', balanceAfter: stats.coins });
        if (def.rewardGems)  logTxn(userId, { type: 'achievement', direction: 'in', name: achName, amount: def.rewardGems, currency: 'gems', balanceAfter: stats.gems });

        // Vật phẩm thưởng (từ catalog) → cấp vào túi đồ + kèm icon/ảnh cho popup.
        const rewardItems = Array.isArray(def.rewardItems) ? def.rewardItems : [];
        const itemsDetailed = [];
        if (rewardItems.length) {
            const ids = rewardItems.map(i => i && i.itemId).filter(Boolean);
            const idefs = await ItemDefinition.find({ itemId: { $in: ids } }).select('itemId name icon image').lean();
            const dmap = new Map(idefs.map(d => [d.itemId, d]));
            for (const it of rewardItems) {
                if (!it || !it.itemId) continue;
                const qty = Number(it.quantity) || 1;
                await Inventory.grant(userId, it.itemId, qty, { source: 'achievement' });
                const d = dmap.get(it.itemId) || {};
                itemsDetailed.push({ itemId: it.itemId, quantity: qty, name: d.name || it.itemId, icon: d.icon || '', image: d.image || '' });
            }
        }

        const [userAch] = await Promise.all([
            UserAchievement.create({
                userId,
                achievementDefinitionId: def._id,
                code: achievementId,
                claimedRewards: { xp: def.rewardXp, coins: def.rewardCoins, gems: def.rewardGems, items: rewardItems },
            }),
            stats.save(),
            profile?.save(),
            Notification.create({
                userId,
                type: 'achievement',
                title: `Thành tích mới: ${def.name}`,
                body: def.description,
                data: { achievementCode: achievementId },
            }),
        ]);

        res.json({
            success: true,
            message: 'Achievement unlocked!',
            data: {
                achievement: { id: def.code, name: def.name, description: def.description, icon: def.icon },
                rewards: { coins: def.rewardCoins, xp: def.rewardXp, gems: def.rewardGems, items: itemsDetailed },
            },
        });
    } catch (error) {
        logger.error('Error in unlockAchievement:', error);
        next(error);
    }
};

exports.updateQuests = async (req, res, next) => {
    try {
        const { daily, lastResetDate } = req.body;
        const userId = req.user.id;

        if (daily && Array.isArray(daily)) {
            const today = new Date().toISOString().split('T')[0];
            const completed = daily.filter(q => q.completed);
            await UserDailyQuest.findOneAndUpdate(
                { userId, date: today },
                { $set: { quests: daily, totalCompleted: completed.length } },
                { upsert: true }
            );
        }

        res.json({ success: true, message: 'Quests updated successfully', data: { daily, lastResetDate } });
    } catch (error) {
        logger.error('Error in updateQuests:', error);
        next(error);
    }
};

// applyShopEffect moved to services/shopEffects.js (Phase 3).

// purchaseItem moved to controllers/shopController.js (P4).
