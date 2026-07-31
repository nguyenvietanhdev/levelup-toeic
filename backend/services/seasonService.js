// ===================================
// SEASON SERVICE — reset mùa giải
// ===================================
// Lưu Hall of Fame (snapshot top) rồi reset các nhóm dữ liệu được bật, sau đó
// tạo mùa mới. Reset áp dụng cho TẤT CẢ người dùng (kiểu reset mùa của game).

const logger = require('../utils/logger');

const Season = require('../models/Season');
const SeasonHallOfFame = require('../models/SeasonHallOfFame');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const UserAchievement = require('../models/UserAchievement');
const UserQuest = require('../models/UserQuest');
const UserDailyQuest = require('../models/UserDailyQuest');
const PracticeSession = require('../models/PracticeSession');
const Notification = require('../models/Notification');
const WrongWord = require('../models/WrongWord');
const UserUpload = require('../models/UserUpload');
const ToeicAttempt = require('../models/ToeicAttempt');
const UserCheckin = require('../models/UserCheckin');
const UserSpin = require('../models/UserSpin');
const InventoryItem = require('../models/InventoryItem');
const ItemDefinition = require('../models/ItemDefinition');
const UserSeasonRecord = require('../models/UserSeasonRecord');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Snapshot top 10 (theo totalXp) vào Hall of Fame trước khi reset. */
async function snapshotHallOfFame(season) {
    try {
        const topStats = await UserStats.find({}).sort({ totalXp: -1 }).limit(10).lean();
        const userIds = topStats.map((s) => s.userId);
        const [profiles, users] = await Promise.all([
            UserProfile.find({ userId: { $in: userIds } }).select('userId username level').lean(),
            User.find({ _id: { $in: userIds } }).select('email').lean(),
        ]);
        const pMap = new Map(profiles.map((p) => [String(p.userId), p]));
        const uMap = new Map(users.map((u) => [String(u._id), u]));

        const topUsers = topStats.map((s, i) => {
            const p = pMap.get(String(s.userId)) || {};
            const u = uMap.get(String(s.userId)) || {};
            return {
                rank: i + 1,
                email: u.email || '',
                username: p.username || '',
                level: p.level || 1,
                xp: s.xp || 0,
                totalXp: s.totalXp || 0,
                coins: s.coins || 0,
                gems: s.gems || 0,
            };
        });

        await SeasonHallOfFame.create({
            seasonNumber: season.seasonNumber,
            startAt: season.startAt,
            endedAt: new Date(),
            topUsers,
        });
    } catch (err) {
        logger.warn('snapshotHallOfFame failed (non-fatal)', { error: err.message });
    }
}

/** Reset các nhóm dữ liệu được bật. */
async function resetData(buckets = {}) {
    if (buckets.resources) {
        await UserStats.updateMany({}, {
            $set: {
                coins: 0, gems: 0, xp: 0, totalXp: 0, energy: 100,
                // Tiêu hao (counter trên UserStats) về 0 theo mùa.
                shields: 0, hints: 0, timeFreezes: 0,
                xpBoostActive: false, xpBoostMultiplier: 1, xpBoostExpiresAt: null,
                coinsBoostActive: false, coinsBoostMultiplier: 1, coinsBoostExpiresAt: null,
                vipExpiresAt: null,
            },
        });
        await UserProfile.updateMany({}, { $set: { level: 1 } });
        // Xoá đồ TIÊU HAO trong túi (thẻ boost, vé quay…), GIỮ cosmetic đã mua.
        const cosmeticIds = (await ItemDefinition.find({ type: /^cosmetic_/ }).select('itemId').lean())
            .map(d => d.itemId);
        await InventoryItem.deleteMany({ itemId: { $nin: cosmeticIds } });
    }

    if (buckets.progress) {
        await Promise.all([
            UserAchievement.deleteMany({}),
            UserQuest.deleteMany({}),
            UserDailyQuest.deleteMany({}),
        ]);
        await UserStats.updateMany({}, {
            $set: { streakCurrent: 0, streakLongest: 0, streakLastPlayDate: null, streakShieldsUsed: 0 },
        });
    }

    if (buckets.stats) {
        await Promise.all([
            PracticeSession.deleteMany({}),
            Notification.deleteMany({}),
            ToeicAttempt.deleteMany({}),
            UserCheckin.deleteMany({}),
            UserSpin.deleteMany({}),
        ]);
        await UserStats.updateMany({}, {
            $set: {
                totalSessions: 0, totalQuestionsAnswered: 0, totalCorrectAnswers: 0,
                perfectRounds: 0, highestScore: 0, totalPlayTime: 0,
                practiceHistory: [], transactions: [],
            },
        });
    }

    if (buckets.learning) {
        await Promise.all([
            WrongWord.deleteMany({}),
            UserUpload.deleteMany({}),
        ]);
        await User.updateMany({}, { $set: { favoriteWords: [] } });
    }
}

/**
 * Snapshot thành tích CÁ NHÂN của MỌI người chơi trong mùa (trước khi reset).
 * Nhờ vậy ai cũng xem lại được hành trình ở tab Hồ sơ, không chỉ top 10.
 * Best-effort: lỗi ở đây KHÔNG được chặn reset mùa.
 */
async function snapshotUserSeasonRecords(season) {
    try {
        const nonPlayers = (await User.find({ role: { $ne: 'user' } }).select('_id').lean())
            .map(u => String(u._id));

        // Sắp theo totalXp để tính hạng luôn trong 1 lượt.
        const allStats = await UserStats.find({}).sort({ totalXp: -1 }).lean();
        const stats = allStats.filter(s => !nonPlayers.includes(String(s.userId)));
        if (stats.length === 0) return;

        const userIds = stats.map(s => s.userId);
        const [profiles, achCounts] = await Promise.all([
            UserProfile.find({ userId: { $in: userIds } }).select('userId level').lean(),
            UserAchievement.aggregate([
                { $match: { userId: { $in: userIds } } },
                { $group: { _id: '$userId', n: { $sum: 1 } } },
            ]),
        ]);
        const levelMap = new Map(profiles.map(p => [String(p.userId), p.level || 1]));
        const achMap = new Map(achCounts.map(a => [String(a._id), a.n]));

        const ops = stats.map((s, i) => {
            const correct = s.totalCorrectAnswers || 0;
            const wrong = s.totalWrongAnswers || 0;
            const answered = correct + wrong;
            return {
                updateOne: {
                    filter: { userId: s.userId, seasonNumber: season.seasonNumber },
                    update: {
                        $set: {
                            level: levelMap.get(String(s.userId)) || 1,
                            totalXp: s.totalXp || 0,
                            rank: i + 1,
                            wordsLearned: (s.wordsLearned || []).length,
                            totalSessions: s.totalSessions || 0,
                            correctAnswers: correct,
                            wrongAnswers: wrong,
                            accuracy: answered > 0 ? Math.round((correct / answered) * 100) : 0,
                            perfectRounds: s.perfectRounds || 0,
                            streakLongest: s.streakLongest || 0,
                            totalPlayTime: s.totalPlayTime || 0,
                            achievementsUnlocked: achMap.get(String(s.userId)) || 0,
                            startAt: season.startAt,
                            endedAt: new Date(),
                        },
                    },
                    upsert: true,
                },
            };
        });

        await UserSeasonRecord.bulkWrite(ops, { ordered: false });
        logger.info(`Season ${season.seasonNumber}: lưu thành tích ${ops.length} người chơi.`);
    } catch (err) {
        logger.warn('snapshotUserSeasonRecords failed (non-fatal)', { error: err.message });
    }
}

/**
 * Chạy reset mùa: snapshot → reset → kết thúc mùa hiện tại → mở mùa mới.
 * @param {'auto'|'manual'} triggeredBy
 */
async function runSeasonReset(triggeredBy = 'auto') {
    const season = await Season.getCurrent();

    await snapshotHallOfFame(season);
    await snapshotUserSeasonRecords(season); // PHẢI trước resetData (đọc số liệu gốc)
    await resetData(season.resetBuckets || {});

    const now = new Date();
    const prevDuration = (new Date(season.endAt) - new Date(season.startAt)) || 30 * DAY_MS;
    const duration = prevDuration > 0 ? prevDuration : 30 * DAY_MS;

    season.status = 'ended';
    season.lastResetAt = now;
    await season.save();

    const next = await Season.create({
        seasonNumber: season.seasonNumber + 1,
        startAt: now,
        endAt: new Date(now.getTime() + duration),
        status: 'active',
        resetBuckets: season.resetBuckets,
    });

    logger.info('Season reset completed', {
        from: season.seasonNumber, to: next.seasonNumber, triggeredBy,
    });
    return next;
}

/** Kiểm tra & tự reset nếu mùa hiện tại đã quá hạn (gọi định kỳ). */
async function checkAndAutoReset() {
    try {
        const season = await Season.findOne({ status: 'active' }).sort({ seasonNumber: -1 });
        if (season && new Date() >= new Date(season.endAt)) {
            logger.info('Season expired — auto resetting', { seasonNumber: season.seasonNumber });
            await runSeasonReset('auto');
        }
    } catch (err) {
        logger.warn('checkAndAutoReset failed', { error: err.message });
    }
}

module.exports = { runSeasonReset, checkAndAutoReset, snapshotHallOfFame };
