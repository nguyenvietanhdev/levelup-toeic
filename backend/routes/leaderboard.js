const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const ItemDefinition = require('../models/ItemDefinition');
const ToeicAttempt = require('../models/ToeicAttempt');
const { requiredLevelFor } = require('../services/featureUnlock');

/**
 * Chỉ user ĐÃ MỞ KHOÁ bảng xếp hạng mới được lên bảng — người chưa đủ Level
 * không xuất hiện (tránh lộ tài khoản mới/level 1 làm loãng bảng).
 * Trả về Set userId hợp lệ, hoặc null nếu mốc không bật (không lọc).
 */
async function eligibleByUnlock(userIds) {
    const need = await requiredLevelFor('feature:leaderboard');
    if (need <= 1) return null; // không khoá → không lọc
    const [ok, bypass] = await Promise.all([
        UserProfile.find({ userId: { $in: userIds }, level: { $gte: need } }).select('userId').lean(),
        // Tài khoản ngoại lệ vẫn lên bảng dù chưa đủ Level.
        User.find({ _id: { $in: userIds }, bypassFeatureLock: true }).select('_id').lean(),
    ]);
    return new Set([
        ...ok.map(p => String(p.userId)),
        ...bypass.map(u => String(u._id)),
    ]);
}

const SORT_FIELD_MAP = { score: 'highestScore', xp: 'xp', totalXp: 'totalXp', streak: 'streakCurrent', accuracy: 'accuracy', playtime: 'totalPlayTime' };
const ONLINE_THRESHOLD_MS = 15 * 60 * 1000;

// In-memory cache — tránh query MongoDB mỗi giây khi nhiều user load bảng xếp hạng
const _cache = new Map();
const LB_TTL = 5 * 60 * 1000; // 5 phút

function getCache(key) {
    const e = _cache.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > LB_TTL) { _cache.delete(key); return null; }
    return e.data;
}
function setCache(key, data) {
    _cache.set(key, { data, ts: Date.now() });
    if (_cache.size > 30) { // evict oldest khi cache quá lớn
        const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        _cache.delete(oldest[0]);
    }
}

function getPeriodQuery(period) {
    const now = new Date();
    if (period === 'daily') {
        return { lastLoginAt: { $gte: new Date(now.setHours(0, 0, 0, 0)) } };
    } else if (period === 'weekly') {
        const start = new Date(now);
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        return { lastLoginAt: { $gte: start } };
    }
    return {};
}

// Số user "online" — lastLoginAt trong vòng ONLINE_THRESHOLD_MS gần nhất.
// Đặt TRƯỚC route ':period?' không sẽ bị nuốt thành period='online-count'.
router.get('/online-count', async (req, res) => {
    try {
        const onlineThreshold = new Date(Date.now() - ONLINE_THRESHOLD_MS);
        const count = await User.countDocuments({
            isActive: true,
            role: { $ne: 'admin' },
            lastLoginAt: { $gte: onlineThreshold },
        });
        res.json({ success: true, count });
    } catch (error) {
        logger.error('Online count error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch online count' });
    }
});

/**
 * Bảng xếp hạng THI TOEIC theo Part (1..7).
 * Lấy điểm TỐT NHẤT của mỗi user ở part đó (từ các bài đã hoàn thành).
 * GET /api/leaderboard/toeic/part/:part?limit=100
 */
router.get('/toeic/part/:part', async (req, res) => {
    try {
        const part = Number(req.params.part);
        if (!Number.isInteger(part) || part < 1 || part > 7) {
            return res.status(400).json({ success: false, message: 'Part phải từ 1 đến 7' });
        }
        const limit = Math.min(Number(req.query.limit) || 100, 200);

        const rows = await ToeicAttempt.aggregate([
            { $match: { status: 'completed' } },
            { $unwind: '$partScores' },
            { $match: { 'partScores.partNumber': part } },
            { $project: {
                userId: 1,
                correct: '$partScores.correctAnswers',
                total: '$partScores.totalQuestions',
                acc: { $cond: [
                    { $gt: ['$partScores.totalQuestions', 0] },
                    { $divide: ['$partScores.correctAnswers', '$partScores.totalQuestions'] },
                    0,
                ] },
            } },
            // Mỗi user lấy lần làm TỐT NHẤT ở part này.
            { $sort: { acc: -1, correct: -1 } },
            { $group: { _id: '$userId', acc: { $first: '$acc' }, correct: { $first: '$correct' }, total: { $first: '$total' }, attempts: { $sum: 1 } } },
            { $sort: { acc: -1, correct: -1 } },
            { $limit: limit },
        ]);

        let userIds = rows.map(r => r._id);
        // Ẩn user chưa mở khoá bảng xếp hạng (cùng luật với bảng chính).
        const unlockedSet = await eligibleByUnlock(userIds);
        const visible = unlockedSet ? rows.filter(r => unlockedSet.has(String(r._id))) : rows;
        userIds = visible.map(r => r._id);

        const [profiles, defs] = await Promise.all([
            UserProfile.find({ userId: { $in: userIds } }).select('userId username avatar level equipped').lean(),
            ItemDefinition.find({}).select('itemId image').lean(),
        ]);
        const pMap = new Map(profiles.map(p => [String(p.userId), p]));
        const imgById = new Map(defs.map(d => [d.itemId, d.image]));

        const data = visible.map((r, i) => {
            const p = pMap.get(String(r._id)) || {};
            return {
                rank: i + 1,
                id: r._id,
                username: p.username || '—',
                avatar: p.avatar || '',
                level: p.level || 1,
                partCorrect: r.correct || 0,
                partTotal: r.total || 0,
                partAccuracy: Math.round((r.acc || 0) * 100),
                attempts: r.attempts || 0,
                background: p.equipped?.background || null,
                frame: p.equipped?.frame || null,
                avatarImage: imgById.get(p.equipped?.avatar) || null,
            };
        });

        res.json({ success: true, part, count: data.length, data });
    } catch (error) {
        logger.error('TOEIC part leaderboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch TOEIC part leaderboard' });
    }
});

router.get('/:period?', async (req, res) => {
    try {
        const { period = 'all-time' } = req.params;
        const { limit = 100, sortBy = 'totalXp', order = 'desc' } = req.query;
        const limitNum = Math.min(parseInt(limit) || 100, 100);
        const sortField = SORT_FIELD_MAP[sortBy] || 'totalXp';
        const dir = order === 'asc' ? 1 : -1;
        const onlineThreshold = new Date(Date.now() - ONLINE_THRESHOLD_MS);

        const lbNeed = await requiredLevelFor('feature:leaderboard');
        const cacheKey = `lb:${period}:${sortField}:${dir}:${limitNum}:lv${lbNeed}`;
        const cached = getCache(cacheKey);
        if (cached) {
            // Cập nhật isOnline + isVip realtime (thay đổi theo thời gian, không cache)
            const nowMs = Date.now();
            cached.forEach(e => {
                e.isOnline = e._lastLogin && new Date(e._lastLogin) >= onlineThreshold;
                e.isVip = !!(e._vipExpiresAt && new Date(e._vipExpiresAt).getTime() > nowMs);
            });
            // Avatar/nền/khung cosmetic realtime — không đợi cache 5 phút hết hạn.
            await applyLiveCosmetics(cached);
            return res.json({ success: true, period, sortBy: sortField, count: cached.length, data: cached, _cached: true });
        }

        const userQuery = { isActive: true, role: { $ne: 'admin' }, ...getPeriodQuery(period) };
        const eligibleUsers = await User.find(userQuery).select('_id lastLoginAt').lean();
        let eligibleIds = eligibleUsers.map(u => u._id);
        const lastLoginMap = new Map(eligibleUsers.map(u => [u._id.toString(), u.lastLoginAt]));

        // Ẩn user chưa mở khoá bảng xếp hạng.
        const unlockedSet = await eligibleByUnlock(eligibleIds);
        if (unlockedSet) eligibleIds = eligibleIds.filter(id => unlockedSet.has(String(id)));

        // Aggregation: tính accuracy (đúng/(đúng+sai)) rồi sort theo field + hướng chọn.
        const topStats = await UserStats.aggregate([
            { $match: { userId: { $in: eligibleIds } } },
            { $addFields: {
                accuracy: { $let: {
                    vars: { tot: { $add: [{ $ifNull: ['$totalCorrectAnswers', 0] }, { $ifNull: ['$totalWrongAnswers', 0] }] } },
                    in: { $cond: [{ $gt: ['$$tot', 0] }, { $divide: [{ $ifNull: ['$totalCorrectAnswers', 0] }, '$$tot'] }, 0] },
                } },
            } },
            { $sort: { [sortField]: dir, _id: 1 } },
            { $limit: limitNum },
        ]);

        const profileMap = await fetchProfileMap(topStats.map(s => s.userId));

        // Ảnh avatar cosmetic — lấy từ DB (admin sửa được), không hardcode.
        const avatarIds = [...new Set([...profileMap.values()].map(p => p.equipped?.avatar).filter(Boolean))];
        let avatarImgById = new Map();
        if (avatarIds.length) {
            const defs = await ItemDefinition.find({ itemId: { $in: avatarIds } }).select('itemId image').lean();
            avatarImgById = new Map(defs.map(d => [d.itemId, d.image || '']));
        }

        const leaderboard = topStats.map((s, i) => {
            const p = profileMap.get(s.userId.toString()) || {};
            const lastLogin = lastLoginMap.get(s.userId.toString());
            return {
                rank: i + 1,
                id: s.userId,
                username: p.username || '—',
                avatar: p.avatar || '',
                level: p.level || 1,
                xp: s.xp || 0,
                totalXp: s.totalXp || 0,
                score: s.highestScore || 0,
                gems: s.gems || 0,
                streak: s.streakCurrent || 0,
                accuracy: Math.round((s.accuracy || 0) * 100), // %
                studyTime: s.totalPlayTime || 0, // giây
                gamesPlayed: s.totalGamesPlayed || 0,
                isOnline: lastLogin && new Date(lastLogin) >= onlineThreshold,
                _lastLogin: lastLogin, // giữ để recalc isOnline khi serve từ cache
                isVip: !!(s.vipExpiresAt && new Date(s.vipExpiresAt).getTime() > Date.now()),
                _vipExpiresAt: s.vipExpiresAt || null, // recalc isVip khi serve từ cache
                background: p.equipped?.background || null, // cosmetic nền đang trang bị
                frame: p.equipped?.frame || null, // cosmetic khung avatar đang trang bị
                avatarImage: avatarImgById.get(p.equipped?.avatar) || null, // ảnh avatar cosmetic (từ DB)
            };
        });

        setCache(cacheKey, leaderboard);
        res.json({ success: true, period, sortBy: sortField, count: leaderboard.length, data: leaderboard });
    } catch (error) {
        logger.error('Leaderboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch leaderboard', error: error.message });
    }
});

router.get('/rank/:userId/:period?', async (req, res) => {
    try {
        const { userId, period = 'all-time' } = req.params;
        const { sortBy = 'totalXp' } = req.query;
        const sortField = SORT_FIELD_MAP[sortBy] || 'totalXp';

        // Reject non-ObjectId userId (e.g. guest localStorage IDs)
        if (!userId.match(/^[a-f\d]{24}$/i)) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = await User.findById(userId).lean();
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const stats = await UserStats.findOne({ userId }).lean();
        const profile = await UserProfile.findOne({ userId }).lean();

        const baseQuery = { isActive: true, role: { $ne: 'admin' }, ...getPeriodQuery(period) };
        const eligibleUsers = await User.find(baseQuery).select('_id').lean();
        let eligibleIds = eligibleUsers.map(u => u._id);
        // Cùng luật với bảng: chỉ đếm user đã mở khoá → hạng khớp bảng hiển thị.
        const unlockedSet = await eligibleByUnlock(eligibleIds);
        if (unlockedSet) eligibleIds = eligibleIds.filter(id => unlockedSet.has(String(id)));

        const userValue = stats?.[sortField] || 0;

        const [betterCount, totalUsers] = await Promise.all([
            UserStats.countDocuments({ userId: { $in: eligibleIds }, [sortField]: { $gt: userValue } }),
            UserStats.countDocuments({ userId: { $in: eligibleIds } }),
        ]);

        const rank = betterCount + 1;

        const [aboveStats, belowStats] = await Promise.all([
            UserStats.find({ userId: { $in: eligibleIds }, [sortField]: { $gte: userValue }, userId: { $ne: userId } })
                .sort({ [sortField]: -1 }).limit(3).lean(),
            UserStats.find({ userId: { $in: eligibleIds }, [sortField]: { $lt: userValue } })
                .sort({ [sortField]: -1 }).limit(3).lean(),
        ]);

        const allNearbyIds = [...aboveStats, ...belowStats].map(s => s.userId);
        const nearbyProfiles = await fetchProfileMap(allNearbyIds);

        const formatNearby = (s) => {
            const p = nearbyProfiles.get(s.userId.toString()) || {};
            return { _id: s.userId, username: p.username || '—', avatar: p.avatar || '?', level: p.level || 1, [sortField]: s[sortField] || 0 };
        };

        res.json({
            success: true,
            data: {
                userId: user._id,
                username: profile?.username,
                rank,
                totalUsers,
                percentile: rank > 0 ? Math.round((1 - (rank / totalUsers)) * 100) : 0,
                value: userValue,
                nearbyAbove: aboveStats.map(formatNearby),
                nearbyBelow: belowStats.map(formatNearby),
            },
        });
    } catch (error) {
        logger.error('User rank error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user rank', error: error.message });
    }
});

router.get('/stats/:period?', async (req, res) => {
    try {
        const { period = 'all-time' } = req.params;

        const baseQuery = { isActive: true, role: { $ne: 'admin' }, ...getPeriodQuery(period) };
        const eligibleUsers = await User.find(baseQuery).select('_id').lean();
        const eligibleIds = eligibleUsers.map(u => u._id);

        const [statAgg] = await UserStats.aggregate([
            { $match: { userId: { $in: eligibleIds } } },
            {
                $group: {
                    _id: null,
                    totalPlayers: { $sum: 1 },
                    averageXp: { $avg: '$totalXp' },
                    highestXp: { $max: '$totalXp' },
                    lowestXp: { $min: '$totalXp' },
                    averageScore: { $avg: '$highestScore' },
                    highestScore: { $max: '$highestScore' },
                },
            },
        ]);

        const profileAgg = await UserProfile.aggregate([
            { $match: { userId: { $in: eligibleIds } } },
            { $group: { _id: null, averageLevel: { $avg: '$level' }, maxLevel: { $max: '$level' } } },
        ]);

        const data = statAgg ? {
            totalPlayers: statAgg.totalPlayers,
            averageXp: Math.round(statAgg.averageXp || 0),
            highestXp: statAgg.highestXp || 0,
            lowestXp: statAgg.lowestXp || 0,
            averageScore: Math.round(statAgg.averageScore || 0),
            highestScore: statAgg.highestScore || 0,
            averageLevel: Math.round(profileAgg[0]?.averageLevel || 0),
            maxLevel: profileAgg[0]?.maxLevel || 0,
        } : { totalPlayers: 0, averageXp: 0, highestXp: 0, lowestXp: 0, averageScore: 0, highestScore: 0, averageLevel: 0, maxLevel: 0 };

        res.json({ success: true, period, data });
    } catch (error) {
        logger.error('Leaderboard stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch statistics', error: error.message });
    }
});

async function fetchProfileMap(userIds) {
    const profiles = await UserProfile.find({ userId: { $in: userIds } }).lean();
    return new Map(profiles.map(p => [p.userId.toString(), p]));
}

// Cập nhật avatar/nền/khung cosmetic của các entry theo DB hiện tại (dùng khi serve
// từ cache) → đổi cosmetic hiện ngay, không đợi cache 5 phút. 2 query nhẹ (index userId).
async function applyLiveCosmetics(entries) {
    const ids = entries.map(e => e.id).filter(Boolean);
    if (!ids.length) return;
    const profiles = await UserProfile.find({ userId: { $in: ids } }).select('userId avatar equipped').lean();
    const pById = new Map(profiles.map(p => [p.userId.toString(), p]));
    const avatarIds = [...new Set(profiles.map(p => p.equipped?.avatar).filter(Boolean))];
    let imgById = new Map();
    if (avatarIds.length) {
        const defs = await ItemDefinition.find({ itemId: { $in: avatarIds } }).select('itemId image').lean();
        imgById = new Map(defs.map(d => [d.itemId, d.image || '']));
    }
    for (const e of entries) {
        const p = pById.get(String(e.id)) || {};
        e.avatar = p.avatar || '';
        e.avatarImage = imgById.get(p.equipped?.avatar) || null;
        e.background = p.equipped?.background || null;
        e.frame = p.equipped?.frame || null;
    }
}

module.exports = router;
