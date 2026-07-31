const User            = require('../models/User');
const UserProfile     = require('../models/UserProfile');
const UserStats       = require('../models/UserStats');
const UserAchievement = require('../models/UserAchievement');
const AchievementDefinition = require('../models/AchievementDefinition');
const Notification    = require('../models/Notification');

// ── GET /api/admin/users-stats  ──────────────────────────────────────────────
// Danh sách user kèm profile + stats (cho tab "User Stats" trong dashboard)
exports.getUsersStats = async (req, res, next) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 30);
        const search = (req.query.search || '').trim().toLowerCase();

        // Lấy users từ MongoDB (User model dùng Mongoose)
        const userQuery = search
            ? { $or: [
                { email: { $regex: search, $options: 'i' } },
              ] }
            : {};

        const total = await User.countDocuments(userQuery);
        const users = await User.find(userQuery)
            .select('email role isActive createdAt lastLoginAt')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const userIds = users.map(u => u._id);

        // Batch-fetch profiles + stats
        const [profiles, stats] = await Promise.all([
            UserProfile.find({ userId: { $in: userIds } })
                .select('userId username displayName avatar level currentLevelXp')
                .lean(),
            UserStats.find({ userId: { $in: userIds } })
                .select('userId xp totalXp coins gems streakCurrent streakLongest totalSessions totalCorrectAnswers')
                .lean(),
        ]);

        const profileMap = Object.fromEntries(profiles.map(p => [String(p.userId), p]));
        const statsMap   = Object.fromEntries(stats.map(s => [String(s.userId), s]));

        const data = users.map(u => {
            const id = String(u._id);
            const p  = profileMap[id] || {};
            const s  = statsMap[id]   || {};
            return {
                _id:         u._id,
                email:       u.email,
                role:        u.role,
                isActive:    u.isActive,
                createdAt:   u.createdAt,
                lastLoginAt: u.lastLoginAt,
                username:    p.username    || '',
                displayName: p.displayName || '',
                level:       p.level       || 1,
                xp:          s.xp          || 0,
                totalXp:     s.totalXp     || 0,
                coins:       s.coins       || 0,
                gems:        s.gems        || 0,
                streakCurrent:  s.streakCurrent  || 0,
                streakLongest:  s.streakLongest  || 0,
                totalSessions:  s.totalSessions  || 0,
                totalCorrect:   s.totalCorrectAnswers || 0,
            };
        });

        res.json({ success: true, data, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/admin/user-achievements  ───────────────────────────────────────
// Thành tích của 1 user cụ thể
exports.getUserAchievements = async (req, res, next) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const unlocked = await UserAchievement.find({ userId })
            .select('achievementDefinitionId unlockedAt claimedRewards')
            .lean();

        const defIds = unlocked.map(u => u.achievementDefinitionId);
        const defs   = await AchievementDefinition.find({ _id: { $in: defIds } })
            .select('name description icon category rewardXp rewardCoins rewardGems')
            .lean();
        const defMap = Object.fromEntries(defs.map(d => [String(d._id), d]));

        const data = unlocked.map(u => ({
            ...defMap[String(u.achievementDefinitionId)] || { name: 'Unknown', icon: '🏆' },
            unlockedAt:    u.unlockedAt,
            claimedRewards: u.claimedRewards,
        }));

        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/admin/notifications  ───────────────────────────────────────────
// Xem tất cả notification trong hệ thống
exports.listNotifications = async (req, res, next) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 30);
        const type  = req.query.type || '';

        const filter = type ? { type } : {};
        const total  = await Notification.countDocuments(filter);
        const items  = await Notification.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'email')
            .lean();

        res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/admin/notifications/broadcast  ────────────────────────────────
// Gửi thông báo đến TẤT CẢ user hoặc 1 user cụ thể
exports.broadcastNotification = async (req, res, next) => {
    try {
        const { title, body, type = 'system', userId, userEmail, gift } = req.body;
        if (!title) return res.status(400).json({ success: false, message: 'title required' });

        const cleanItems = Array.isArray(gift?.items)
            ? gift.items.filter(i => i && i.itemId).map(i => ({ itemId: i.itemId, quantity: Number(i.quantity) || 1 }))
            : [];
        const cleanGift = { coins: Number(gift?.coins) || 0, gems: Number(gift?.gems) || 0, xp: Number(gift?.xp) || 0, items: cleanItems };
        const hasGift = cleanGift.coins > 0 || cleanGift.gems > 0 || cleanGift.xp > 0 || cleanItems.length > 0;

        // Gửi 1 user cụ thể → tạo 1 doc gắn userId.
        if (userId || userEmail) {
            let targetId = userId;
            if (!targetId) {
                const user = await User.findOne({ email: userEmail.toLowerCase().trim() }).select('_id').lean();
                if (!user) return res.status(404).json({ success: false, message: `Không tìm thấy user: ${userEmail}` });
                targetId = user._id;
            }
            await Notification.create({ userId: targetId, type, title, body: body || '', read: false, ...(hasGift && { gift: cleanGift }) });
            return res.json({ success: true, sent: 1, broadcast: false });
        }

        // Gửi TẤT CẢ + kèm quà → phải tạo notif riêng cho từng user vì mỗi
        // người cần trạng thái giftClaimed độc lập. Nếu không có quà thì
        // dùng broadcast 1 doc để tiết kiệm DB.
        if (hasGift) {
            const allUsers = await User.find({}).select('_id').lean();
            if (!allUsers.length) return res.json({ success: true, sent: 0, broadcast: false });
            const docs = allUsers.map(u => ({
                userId: u._id, type, title, body: body || '',
                read: false, gift: cleanGift,
            }));
            await Notification.insertMany(docs, { ordered: false });
            return res.json({ success: true, sent: allUsers.length, broadcast: false });
        }

        // Gửi TẤT CẢ không kèm quà → 1 broadcast doc.
        await Notification.create({ userId: null, type, title, body: body || '', read: false, expiresAt: null });
        res.json({ success: true, sent: 1, broadcast: true });
    } catch (err) {
        next(err);
    }
};

// ── DELETE /api/admin/notifications/:id  ────────────────────────────────────
exports.deleteNotification = async (req, res, next) => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};
