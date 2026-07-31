const Notification = require('../models/Notification');
const UserStats    = require('../models/UserStats');
const UserProfile  = require('../models/UserProfile');
const Inventory    = require('../services/inventoryService');
const ItemDefinition = require('../models/ItemDefinition');
const { awardXp }  = require('../utils/userStateHelper');
const { logTxn }   = require('../utils/economyLog');

const TAB_TYPES = {
    system:      ['system', 'reminder', 'reward'],
    achievement: ['achievement', 'quest', 'level_up', 'test_result'],
    violation:   ['violation'],
};

// GET /api/notifications?tab=system|account|violation — 30 thông báo mới nhất.
// Trả CẢ thông báo cá nhân (userId=user) LẪN broadcast global (userId=null).
// Broadcast được gắn isGlobal=true để frontend biết xoá là localStorage-hide
// (không hard-delete server, vì user khác cũng đang dùng doc đó).
exports.list = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const tab    = req.query.tab;
        const filter = {
            $or: [{ userId }, { userId: null }],
        };
        if (tab && TAB_TYPES[tab]) filter.type = { $in: TAB_TYPES[tab] };

        const [raw, tabCounts] = await Promise.all([
            // Giới hạn 50 thông báo mới nhất hiển thị cho user.
            Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
            Notification.aggregate([
                { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(String(userId)), read: false } },
                { $group: { _id: '$type', count: { $sum: 1 } } },
            ]),
        ]);

        const notifications = raw.map(n => ({ ...n, isGlobal: n.userId == null }));

        // Gắn icon/ảnh cho vật phẩm trong quà tặng → frontend hiện preview trước khi nhận.
        const giftItemIds = [...new Set(notifications.flatMap(n => (n.gift?.items || []).map(i => i.itemId)).filter(Boolean))];
        if (giftItemIds.length) {
            const defs = await ItemDefinition.find({ itemId: { $in: giftItemIds } }).select('itemId name icon image').lean();
            const dmap = new Map(defs.map(d => [d.itemId, d]));
            notifications.forEach(n => {
                if (n.gift?.items?.length) {
                    n.gift = { ...n.gift, items: n.gift.items.map(it => {
                        const d = dmap.get(it.itemId) || {};
                        return { itemId: it.itemId, quantity: it.quantity || 1, name: d.name || it.itemId, icon: d.icon || '', image: d.image || '' };
                    }) };
                }
            });
        }

        // Map counts per tab (chỉ đếm notif cá nhân — broadcast không tính
        // vào unread badge để khỏi kẹt số "1" mãi cho mọi user).
        const countMap = {};
        tabCounts.forEach(({ _id, count }) => { countMap[_id] = count; });
        const counts = {
            all:       Object.values(countMap).reduce((a, b) => a + b, 0),
            system:    (countMap.system || 0) + (countMap.reminder || 0),
            account:   (countMap.achievement || 0) + (countMap.quest || 0) + (countMap.level_up || 0) + (countMap.test_result || 0),
            violation: countMap.violation || 0,
        };

        res.json({ success: true, data: notifications, counts });
    } catch (err) {
        next(err);
    }
};

// GET /api/notifications/unread-count — CHỈ đếm notif cá nhân
exports.unreadCount = async (req, res, next) => {
    try {
        const count = await Notification.countDocuments({ userId: req.user.id, read: false });
        res.json({ success: true, data: { count } });
    } catch (err) {
        next(err);
    }
};

// PUT /api/notifications/read-all
exports.readAll = async (req, res, next) => {
    try {
        await Notification.updateMany(
            { userId: req.user.id, read: false },
            { $set: { read: true, readAt: new Date() } }
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// DELETE /api/notifications — xoá TẤT CẢ thông báo của user hiện tại
exports.deleteAll = async (req, res, next) => {
    try {
        const result = await Notification.deleteMany({ userId: req.user.id });
        res.json({ success: true, deletedCount: result.deletedCount || 0 });
    } catch (err) {
        next(err);
    }
};

// DELETE /api/notifications/:id — xoá 1 notif CÁ NHÂN.
// LƯU Ý: không xoá broadcast (userId=null) qua endpoint này — broadcast
// dùng chung cho mọi user, frontend tự ẩn qua localStorage thay vì DB.
exports.deleteOne = async (req, res, next) => {
    try {
        const result = await Notification.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id, // chỉ match notif cá nhân
        });
        if (!result) return res.status(404).json({ success: false, message: 'Notification not found or is a global broadcast' });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// POST /api/notifications/:id/claim-gift
exports.claimGift = async (req, res, next) => {
    try {
        const notif = await Notification.findOne({ _id: req.params.id, userId: req.user.id });
        if (!notif) return res.status(404).json({ success: false, message: 'Notification not found' });

        const { coins = 0, gems = 0, xp = 0, items = [] } = notif.gift || {};
        const itemList = Array.isArray(items) ? items.filter(i => i && i.itemId) : [];
        if (!coins && !gems && !xp && !itemList.length) return res.status(400).json({ success: false, message: 'No gift attached' });
        if (notif.giftClaimed) return res.status(400).json({ success: false, message: 'Gift already claimed' });

        const stats = await UserStats.findOne({ userId: req.user.id });
        if (stats) {
            const profile = await UserProfile.findOne({ userId: req.user.id });
            if (coins) stats.coins += coins;
            if (gems)  stats.gems  += gems;
            // Cộng XP có áp lên cấp ngay (giữ level khớp xp) — xem awardXp.
            if (xp && profile) awardXp(profile, stats, xp);
            await Promise.all([stats.save(), profile?.save()]);
            if (coins) logTxn(req.user.id, { type: 'gift', direction: 'in', name: 'Quà thông báo', amount: coins, currency: 'coins', balanceAfter: stats.coins });
            if (gems)  logTxn(req.user.id, { type: 'gift', direction: 'in', name: 'Quà thông báo', amount: gems, currency: 'gems', balanceAfter: stats.gems });
        }

        // Vật phẩm tặng kèm → cấp vào túi đồ + kèm icon/ảnh cho popup.
        const itemsDetailed = [];
        if (itemList.length) {
            const defs = await ItemDefinition.find({ itemId: { $in: itemList.map(i => i.itemId) } }).select('itemId name icon image').lean();
            const dmap = new Map(defs.map(d => [d.itemId, d]));
            for (const it of itemList) {
                const qty = Number(it.quantity) || 1;
                await Inventory.grant(req.user.id, it.itemId, qty, { source: 'notification' });
                const d = dmap.get(it.itemId) || {};
                itemsDetailed.push({ itemId: it.itemId, quantity: qty, name: d.name || it.itemId, icon: d.icon || '', image: d.image || '' });
            }
        }

        notif.giftClaimed   = true;
        notif.giftClaimedAt = new Date();
        await notif.save();

        res.json({ success: true, reward: { coins, gems, xp, items: itemsDetailed } });
    } catch (err) {
        next(err);
    }
};

// PUT /api/notifications/:id/read
exports.readOne = async (req, res, next) => {
    try {
        await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { $set: { read: true, readAt: new Date() } }
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};
