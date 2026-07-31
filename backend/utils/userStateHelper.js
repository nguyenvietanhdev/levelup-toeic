const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const UserAchievement = require('../models/UserAchievement');
const UserQuest = require('../models/UserQuest');
const AchievementDefinition = require('../models/AchievementDefinition');
const ItemDefinition = require('../models/ItemDefinition');

const XP_FORMULA = (level) => Math.floor(100 * Math.pow(level, 1.5));
const ENERGY_REGEN_PER_MIN = 1;

/**
 * Hệ số hồi năng lượng đang có hiệu lực (thẻ tăng tốc x2/x3). Hết hạn → 1.
 * Tính ở server vì đây là thứ quyết định người chơi được bao nhiêu ⚡.
 */
function energyRegenMultiplier(stats, at = Date.now()) {
    if (!stats?.energyBoostActive || !stats.energyBoostExpiresAt) return 1;
    if (new Date(stats.energyBoostExpiresAt).getTime() <= at) return 1;
    return Math.max(1, stats.energyBoostMultiplier || 1);
}

/**
 * Regenerate energy based on time elapsed since last update.
 * Mutates stats object in place (does not save).
 *
 * Thẻ tăng tốc chỉ nhân phần thời gian THỰC SỰ nằm trong hạn thẻ — nghỉ 10 giờ
 * với thẻ x2 còn 1 giờ thì chỉ 1 giờ đó được nhân đôi, không phải cả 10.
 */
function applyEnergyRegen(stats) {
    const now = Date.now();
    const lastUpdate = new Date(stats.lastEnergyUpdate).getTime();
    const minutesPassed = Math.floor((now - lastUpdate) / 60000);

    if (minutesPassed > 0 && stats.energy < stats.maxEnergy) {
        const mult = energyRegenMultiplier(stats, lastUpdate);
        let boostedMinutes = 0;
        if (mult > 1) {
            const until = new Date(stats.energyBoostExpiresAt).getTime();
            boostedMinutes = Math.max(0, Math.min(minutesPassed, Math.floor((until - lastUpdate) / 60000)));
        }
        const gained = boostedMinutes * mult + (minutesPassed - boostedMinutes);

        stats.energy = Math.min(
            stats.maxEnergy,
            stats.energy + gained * ENERGY_REGEN_PER_MIN
        );
        stats.lastEnergyUpdate = new Date(now);
    }

    // Thẻ hết hạn thì tắt cờ luôn, khỏi để giao diện khoe một boost đã chết.
    if (stats.energyBoostActive && energyRegenMultiplier(stats, now) === 1) {
        stats.energyBoostActive = false;
        stats.energyBoostMultiplier = 1;
    }
}

/**
 * Check and apply level-up based on current xp.
 * Mutates profile + stats in place (does not save).
 * Returns { leveledUp, newLevel, coinsReward }
 */
function applyLevelUp(profile, stats) {
    let xpNeeded = XP_FORMULA(profile.level);
    let leveledUp = false;
    let coinsReward = 0;

    while (stats.xp >= xpNeeded) {
        leveledUp = true;
        profile.level += 1;
        profile.currentLevelXp = xpNeeded;
        stats.xp -= xpNeeded;
        coinsReward += 100;
        xpNeeded = XP_FORMULA(profile.level);
    }

    return { leveledUp, newLevel: profile.level, coinsReward };
}

/**
 * Cộng XP từ các nguồn thưởng phụ (điểm danh, nhiệm vụ, quà, thành tích, vòng quay…)
 * rồi ÁP DỤNG LÊN CẤP NGAY để `UserProfile.level` luôn khớp với `UserStats.xp`.
 *
 * Vì sao cần: level là nguồn sự thật cho khoá tính năng (feature unlock). Nếu chỉ
 * `stats.xp += ...` mà quên áp lên cấp thì xp dồn lại nhưng level đứng yên → user
 * đủ điều kiện mở tính năng nhưng server vẫn khoá (bug lệch level).
 *
 * Mutate profile + stats TẠI CHỖ (không tự save — caller lưu cả hai).
 * Trả về { leveledUp, newLevel, coinsReward, xp }.
 */
function awardXp(profile, stats, amount) {
    const xp = Math.max(0, Math.floor(Number(amount) || 0));
    if (!xp) return { leveledUp: false, newLevel: profile.level, coinsReward: 0, xp: 0 };
    stats.xp += xp;
    stats.totalXp = (stats.totalXp || 0) + xp;
    const r = applyLevelUp(profile, stats);
    if (r.leveledUp) stats.coins += r.coinsReward;
    return { ...r, xp };
}

/**
 * Build the full game state response (same shape as old User.getPublicProfile).
 * Fetches from all relevant collections.
 */
async function buildFullState(userId) {
    const today = new Date().toISOString().split('T')[0];

    const [user, profile, stats, userAchs, defs, todayQuests] = await Promise.all([
        User.findById(userId),
        UserProfile.findOne({ userId }),
        UserStats.findOne({ userId }),
        UserAchievement.find({ userId }),
        AchievementDefinition.find({ isActive: true }).sort({ order: 1 }),
        UserQuest.findOne({ userId, questType: 'daily', periodKey: today }),
    ]);

    if (!user || !profile || !stats) return null;

    // Tự-chữa lệch level: nếu xp đã vượt ngưỡng mà level chưa lên (do một nguồn
    // thưởng phụ trước đây cộng xp mà quên áp lên cấp), áp NGAY và lưu lại. Giữ
    // bất biến `UserProfile.level` luôn khớp `UserStats.xp` — nguồn sự thật cho
    // khoá tính năng. Idempotent: đã khớp thì applyLevelUp không đổi gì.
    const heal = applyLevelUp(profile, stats);
    if (heal.leveledUp) {
        stats.coins += heal.coinsReward;
        await Promise.all([profile.save(), stats.save()]);
    }

    // Merge achievement definitions with user unlock status
    const unlockedMap = new Map(userAchs.map(a => [a.code, a]));
    const achievements = defs.map(def => ({
        id: def.code,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        conditionType: def.conditionType,
        conditionValue: def.conditionValue,
        conditionMode: def.conditionMode,
        rewardCoins: def.rewardCoins,
        rewardXp: def.rewardXp,
        rewardGems: def.rewardGems,
        unlocked: unlockedMap.has(def.code),
        unlockedAt: unlockedMap.get(def.code)?.unlockedAt || null,
    }));

    // Ảnh cosmetic đang trang bị — lấy TỪ DB (admin sửa được ở catalog vật phẩm),
    // KHÔNG hardcode ở frontend. equippedImages: { avatar, background, frame }.
    const equipped = profile.equipped || {};
    const equippedIds = [...new Set(Object.values(equipped).filter(Boolean))];
    const equippedImages = {};
    if (equippedIds.length) {
        const defs = await ItemDefinition.find({ itemId: { $in: equippedIds } }).select('itemId image').lean();
        const imgById = new Map(defs.map(d => [d.itemId, d.image || '']));
        for (const [slot, id] of Object.entries(equipped)) {
            const img = imgById.get(id);
            if (img) equippedImages[slot] = img;
        }
    }

    return {
        user: {
            id: user._id,
            username: profile.username,
            usernameChangedAt: profile.usernameChangedAt || null,
            email: user.email,
            role: user.role,
            avatar: profile.avatar,
            level: profile.level,
            xp: stats.xp,
            totalXp: stats.totalXp,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
            isActive: user.isActive,
            isLocked: user.isLocked,
            lockUntil: user.lockUntil,
            loginAttempts: user.loginAttempts,
        },
        resources: {
            energy: stats.energy,
            maxEnergy: stats.maxEnergy,
            coins: stats.coins,
            gems: stats.gems,
            hints: stats.hints,
            shields: stats.shields,
            timeFreezes: stats.timeFreezes,
            lastEnergyUpdate: stats.lastEnergyUpdate,
        },
        streak: {
            current: stats.streakCurrent,
            longest: stats.streakLongest,
            lastPlayDate: stats.streakLastPlayDate,
            shieldsUsed: stats.streakShieldsUsed,
        },
        progress: {
            wordsLearned: stats.wordsLearned,
            wordsMastered: stats.wordsMastered,
            totalGamesPlayed: stats.totalGamesPlayed,
            totalCorrectAnswers: stats.totalCorrectAnswers,
            totalWrongAnswers: stats.totalWrongAnswers,
            perfectRounds: stats.perfectRounds,
            highestScore: stats.highestScore,
            totalPlayTime: stats.totalPlayTime,
            modeStats: Object.fromEntries(stats.modeStats || new Map()),
        },
        quests: {
            daily: todayQuests?.quests || [],
            lastResetDate: todayQuests?.createdAt || null,
            totalCompleted: todayQuests?.totalCompleted || 0,
        },
        achievements,
        boosts: {
            xp: {
                active: stats.xpBoostActive,
                multiplier: stats.xpBoostMultiplier,
                expiresAt: stats.xpBoostExpiresAt,
            },
            coins: {
                active: stats.coinsBoostActive,
                multiplier: stats.coinsBoostMultiplier,
                expiresAt: stats.coinsBoostExpiresAt,
            },
            // Client cũng hồi ⚡ để header chạy realtime — không gửi hệ số xuống
            // thì nó tính theo 1/phút rồi saveState ghi đè mất phần server cộng.
            energy: {
                active: stats.energyBoostActive,
                multiplier: stats.energyBoostMultiplier,
                expiresAt: stats.energyBoostExpiresAt,
            },
        },
        vip: {
            active: !!(stats.vipExpiresAt && new Date(stats.vipExpiresAt) > new Date()),
            expiresAt: stats.vipExpiresAt ? new Date(stats.vipExpiresAt).getTime() : 0,
        },
        equipped, // cosmetic đang trang bị (itemId theo slot: background, frame, avatar)
        equippedImages, // ảnh cosmetic đang trang bị (từ DB, admin sửa được)
        transactions: stats.transactions || [],
        settings: profile.settings,
        practiceHistory: stats.practiceHistory || [],
    };
}

/**
 * Create User + UserProfile + UserStats atomically for a new user.
 * @param {object} opts - { email, passwordHash, username, role, skipPasswordHash }
 * @returns {{ user, profile, stats }}
 */
async function createUserWithDependents(opts) {
    const { email, passwordHash, username, role = 'user', skipPasswordHash = false,
        googleId, displayName } = opts;

    const user = new User({ email, password: passwordHash, role, ...(googleId ? { googleId } : {}) });
    if (skipPasswordHash) user.$skipPasswordHash = true;
    await user.save();

    const [profile, stats] = await Promise.all([
        UserProfile.create({
            userId: user._id,
            username,
            // Tên hiển thị lấy từ Google (đăng ký thường thì trống, user tự đặt sau).
            displayName: displayName || '',
            avatar: username.charAt(0).toUpperCase(),
        }),
        UserStats.create({ userId: user._id }),
    ]);

    return { user, profile, stats };
}

module.exports = {
    buildFullState,
    applyEnergyRegen,
    energyRegenMultiplier,
    applyLevelUp,
    awardXp,
    createUserWithDependents,
    XP_FORMULA,
};
