const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const AchievementDefinition = require('../models/AchievementDefinition');
const QuestDefinition = require('../models/QuestDefinition');
const ShopItem = require('../models/ShopItem');
const ItemDefinition = require('../models/ItemDefinition');
const Transaction = require('../models/Transaction');
const UserStats = require('../models/UserStats');
const Category = require('../models/Category');
const ChannelConfig = require('../models/ChannelConfig');
const GameConfig = require('../models/GameConfig');
const FeatureUnlock = require('../models/FeatureUnlock');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const { clearUnlockCache } = require('../services/featureUnlock');
const { clearGameConfigCache } = require('../services/gameConfig');
const adminCtrl = require('../controllers/adminController');
const { uploadShopImage, sanitizeRole } = require('../middleware/upload');
const { removeIfOrphan } = require('../utils/uploadCleanup');
const { optimizeUploaded } = require('../utils/imageOptimizer');

const admin = [protect, authorize('admin')];

// ── Upload ảnh vật phẩm — lưu theo KEY danh mục (role = category, vd consumable). ──
// POST /api/admin/upload-image?role=<category-key>  (field: image). Folder tự tạo.
router.post('/upload-image', admin, uploadShopImage.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Thiếu file ảnh' });
    const role = sanitizeRole(req.query.role);
    // Nén ngay lúc upload: ảnh nền cosmetic còn vẽ cho từng dòng bảng xếp hạng,
    // để nguyên PNG 2MB là mỗi lần mở BXH kéo vài MB.
    const url = await optimizeUploaded(req.file.path, `/uploads/${role}/${req.file.filename}`);
    res.json({ success: true, url, role });
});

// ── User Stats & Achievements ────────────────────────────────
router.get('/users-stats',         admin, adminCtrl.getUsersStats);
router.get('/user-achievements',   admin, adminCtrl.getUserAchievements);

// ── Notifications (admin) ────────────────────────────────────
router.get('/notifications',              admin, adminCtrl.listNotifications);
router.post('/notifications/broadcast',   admin, adminCtrl.broadcastNotification);
router.delete('/notifications/:id',       admin, adminCtrl.deleteNotification);

// ── Achievement Definitions ──────────────────────────────────
router.get('/achievements', admin, async (req, res) => {
    const data = await AchievementDefinition.find().sort({ order: 1, createdAt: 1 });
    res.json({ success: true, data });
});

router.get('/achievements/:id', admin, async (req, res) => {
    const data = await AchievementDefinition.findById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
});

router.post('/achievements', admin, async (req, res) => {
    try {
        const data = await AchievementDefinition.create(req.body);
        res.status(201).json({ success: true, message: 'Đã tạo thành tích', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.put('/achievements/:id', admin, async (req, res) => {
    try {
        const data = await AchievementDefinition.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, message: 'Đã cập nhật thành tích', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.delete('/achievements/delete-all', admin, async (req, res) => {
    const result = await AchievementDefinition.deleteMany({});
    res.json({ success: true, message: `Đã xóa ${result.deletedCount} thành tích`, deletedCount: result.deletedCount });
});

router.delete('/achievements/:id', admin, async (req, res) => {
    const data = await AchievementDefinition.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Đã xóa thành tích' });
});

// ── Quest Definitions ────────────────────────────────────────
router.get('/quests', admin, async (req, res) => {
    const data = await QuestDefinition.find().sort({ type: 1, createdAt: 1 });
    res.json({ success: true, data });
});

router.get('/quests/:id', admin, async (req, res) => {
    const data = await QuestDefinition.findById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
});

router.post('/quests', admin, async (req, res) => {
    try {
        const data = await QuestDefinition.create(req.body);
        res.status(201).json({ success: true, message: 'Đã tạo nhiệm vụ', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.put('/quests/:id', admin, async (req, res) => {
    try {
        const data = await QuestDefinition.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, message: 'Đã cập nhật nhiệm vụ', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.delete('/quests/delete-all', admin, async (req, res) => {
    const result = await QuestDefinition.deleteMany({});
    res.json({ success: true, message: `Đã xóa ${result.deletedCount} nhiệm vụ`, deletedCount: result.deletedCount });
});

router.delete('/quests/:id', admin, async (req, res) => {
    const data = await QuestDefinition.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Đã xóa nhiệm vụ' });
});

// ── Shop Items ───────────────────────────────────────────────
router.get('/shop-items', admin, async (req, res) => {
    const data = await ShopItem.find().sort({ order: 1 });
    res.json({ success: true, data });
});

router.get('/shop-items/:id', admin, async (req, res) => {
    const data = await ShopItem.findById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
});

router.post('/shop-items', admin, async (req, res) => {
    try {
        const data = await ShopItem.create(req.body);
        res.status(201).json({ success: true, message: 'Đã tạo item', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.put('/shop-items/:id', admin, async (req, res) => {
    try {
        const { itemId, _id, __v, ...fields } = req.body;
        if (fields.discountPercent !== undefined) fields.discountPercent = Number(fields.discountPercent) || 0;
        if (fields.price !== undefined) fields.price = Number(fields.price);
        if (fields.order !== undefined) fields.order = Number(fields.order);
        const before = await ShopItem.findById(req.params.id).select('image').lean();
        const data = await ShopItem.findByIdAndUpdate(
            req.params.id,
            { $set: fields },
            { new: true, runValidators: true }
        );
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        // Đổi ảnh → xoá file cũ nếu không còn ai dùng (chống rác tích luỹ).
        if (before?.image && before.image !== data.image) removeIfOrphan(before.image);
        res.json({ success: true, message: 'Đã cập nhật item', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.delete('/shop-items/:id', admin, async (req, res) => {
    const data = await ShopItem.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    if (data.image) removeIfOrphan(data.image);
    res.json({ success: true, message: 'Đã xóa item' });
});

// ── Bảng kinh tế: thu/chi (faucet/sink) theo currency + nguồn ───
router.get('/economy', admin, async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 365);
        const since = new Date(Date.now() - days * 86400000);
        // Loại admin/tài khoản nội bộ (role != 'user') khỏi thống kê — tránh nhiễu
        // (vd admin nạp sẵn 999.999 xu/đá để test).
        const nonPlayers = (await require('../models/User').find({ role: { $ne: 'user' } }).select('_id').lean()).map(u => u._id);
        const rows = await Transaction.aggregate([
            { $match: { at: { $gte: since }, currency: { $in: ['coins', 'gems'] }, userId: { $nin: nonPlayers } } },
            { $group: { _id: { type: '$type', direction: '$direction', currency: '$currency' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);
        const cur = { coins: { in: 0, out: 0 }, gems: { in: 0, out: 0 } };
        const bySource = [];
        rows.forEach(r => {
            const { type, direction, currency } = r._id;
            if (cur[currency] && (direction === 'in' || direction === 'out')) cur[currency][direction] += r.total;
            bySource.push({ type, direction: direction || 'out', currency, total: r.total, count: r.count });
        });
        bySource.sort((a, b) => b.total - a.total);
        // Tổng tiền đang lưu hành (money supply) — chỉ player thật, tăng đều = lạm phát.
        const supplyAgg = await UserStats.aggregate([
            { $match: { userId: { $nin: nonPlayers } } },
            { $group: { _id: null, coins: { $sum: '$coins' }, gems: { $sum: '$gems' } } },
        ]);
        const supply = supplyAgg[0] || { coins: 0, gems: 0 };
        res.json({
            success: true, days,
            currencies: {
                coins: { in: cur.coins.in, out: cur.coins.out, net: cur.coins.in - cur.coins.out },
                gems: { in: cur.gems.in, out: cur.gems.out, net: cur.gems.in - cur.gems.out },
            },
            bySource,
            supply: { coins: supply.coins || 0, gems: supply.gems || 0 },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Danh mục (shop/quest/achievement) — CRUD ────────────────
router.get('/categories', admin, async (req, res) => {
    const q = req.query.domain ? { domain: req.query.domain } : {};
    const data = await Category.find(q).sort({ domain: 1, order: 1 }).lean();
    res.json({ success: true, data });
});
router.post('/categories', admin, async (req, res) => {
    try {
        const data = await Category.create(req.body);
        res.status(201).json({ success: true, message: 'Đã tạo danh mục', data });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.put('/categories/:id', admin, async (req, res) => {
    try {
        const { _id, __v, domain, key, ...fields } = req.body; // không đổi domain/key
        const data = await Category.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true, runValidators: true });
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, message: 'Đã cập nhật danh mục', data });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
// Xoá danh mục đang có vật phẩm là làm mồ côi cả nhóm: lần sau mở vật phẩm đó
// trong admin, select không còn option tương ứng nên value tụt về '' và bản lưu
// sẽ xoá luôn category → vật phẩm biến mất khỏi mọi kênh mà không báo gì.
// (Đúng thứ đã xảy ra với danh mục 'energy' + gói "Nạp đầy năng lượng".)
router.delete('/categories/:id', admin, async (req, res) => {
    const cat = await Category.findById(req.params.id).lean();
    if (!cat) return res.status(404).json({ success: false, message: 'Not found' });

    if (cat.domain === 'item') {
        const used = await ItemDefinition.countDocuments({ category: cat.key });
        if (used > 0) {
            return res.status(409).json({
                success: false,
                message: `Còn ${used} vật phẩm thuộc danh mục "${cat.label}" — chuyển chúng sang danh mục khác trước, nếu không chúng sẽ mất khỏi cửa hàng/túi đồ.`,
            });
        }
        const channels = await ChannelConfig.find({ categories: cat.key }).select('channel').lean();
        if (channels.length) {
            return res.status(409).json({
                success: false,
                message: `Các kênh [${channels.map(c => c.channel).join(', ')}] đang bày danh mục "${cat.label}" — bỏ chọn ở tab Kênh trước đã.`,
            });
        }
    }

    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Đã xóa danh mục' });
});

// ── Catalog vật phẩm (item_definitions) — CRUD ───────────────
router.get('/item-defs', admin, async (req, res) => {
    const data = await ItemDefinition.find().sort({ order: 1, itemId: 1 }).lean();
    res.json({ success: true, data });
});
router.get('/item-defs/:id', admin, async (req, res) => {
    const data = await ItemDefinition.findById(req.params.id).lean();
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
});
// Quy tắc suy `type` + kiểm effect nằm ở utils/itemDefRules.js (thuần, có test).
const { deriveType, badEffect, badListing } = require('../utils/itemDefRules');

router.post('/item-defs', admin, async (req, res) => {
    try {
        const bad = badEffect(req.body.effect) || badListing(req.body);
        if (bad) return res.status(400).json({ success: false, message: bad });
        req.body.type = deriveType(req.body.category, req.body.type);
        const data = await ItemDefinition.create(req.body);
        res.status(201).json({ success: true, message: 'Đã tạo vật phẩm', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.put('/item-defs/:id', admin, async (req, res) => {
    try {
        const { itemId, _id, __v, ...fields } = req.body;
        if (fields.durationSec !== undefined) fields.durationSec = Number(fields.durationSec) || 0;
        if (fields.order !== undefined) fields.order = Number(fields.order) || 0;
        const before = await ItemDefinition.findById(req.params.id).select('image type category published price').lean();
        if (!before) return res.status(404).json({ success: false, message: 'Not found' });
        // Kiểm trên bản GỘP: PUT có thể chỉ gửi vài field, xét riêng req.body sẽ
        // bỏ sót (vd chỉ gửi category:'' trong khi giá/published nằm ở bản cũ).
        const bad = badEffect(fields.effect) || badListing({ ...before, ...fields });
        if (bad) return res.status(400).json({ success: false, message: bad });
        // đồng bộ type theo category, nhưng giữ type cũ nếu category không có tab riêng
        if (fields.category !== undefined) fields.type = deriveType(fields.category, before?.type);
        const data = await ItemDefinition.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true, runValidators: true });
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        if (before?.image && before.image !== data.image) removeIfOrphan(before.image);
        res.json({ success: true, message: 'Đã cập nhật vật phẩm', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.delete('/item-defs/:id', admin, async (req, res) => {
    const data = await ItemDefinition.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    if (data.image) removeIfOrphan(data.image);
    res.json({ success: true, message: 'Đã xóa vật phẩm' });
});

// ── Seed defaults ─────────────────────────────────────────────
router.post('/seed-achievements', admin, async (req, res) => {
    const defaults = [
        { code: 'learning1', name: 'Người mới bắt đầu', description: 'Học 10 từ vựng đầu tiên',      icon: '📖', category: 'learning', conditionType: 'words_learned', conditionValue: 10,  rewardCoins: 100, rewardXp: 50,  rewardGems: 0,  order: 1 },
        { code: 'learning2', name: 'Học sinh chăm chỉ', description: 'Học 50 từ vựng',               icon: '🎓', category: 'learning', conditionType: 'words_learned', conditionValue: 50,  rewardCoins: 300, rewardXp: 150, rewardGems: 5,  order: 2 },
        { code: 'learning3', name: 'Bậc thầy từ vựng', description: 'Học 200 từ vựng',              icon: '🏆', category: 'learning', conditionType: 'words_learned', conditionValue: 200, rewardCoins: 1000,rewardXp: 500, rewardGems: 20, order: 3 },
        { code: 'learning4', name: 'Từ điển sống',      description: 'Học 500 từ vựng',              icon: '📚', category: 'learning', conditionType: 'words_learned', conditionValue: 500, rewardCoins: 2000,rewardXp: 1000,rewardGems: 50, order: 4 },
        { code: 'practice1', name: 'Tay mơ',            description: 'Hoàn thành 5 bài luyện tập',  icon: '🎮', category: 'practice', conditionType: 'sessions',      conditionValue: 5,   rewardCoins: 50,  rewardXp: 25,  rewardGems: 0,  order: 10 },
        { code: 'practice2', name: 'Điểm số hoàn hảo',  description: 'Đạt 10 vòng hoàn hảo',        icon: '⭐', category: 'practice', conditionType: 'perfect_rounds',conditionValue: 10,  rewardCoins: 500, rewardXp: 250, rewardGems: 10, order: 11 },
        { code: 'practice3', name: 'Tốc độ ánh sáng',   description: 'Trả lời 100 câu đúng',        icon: '⚡', category: 'practice', conditionType: 'correct_answers',conditionValue: 100, rewardCoins: 300, rewardXp: 150, rewardGems: 0,  order: 12 },
        { code: 'practice4', name: 'Chiến binh',         description: 'Hoàn thành 50 bài luyện tập', icon: '⚔️', category: 'practice', conditionType: 'sessions',      conditionValue: 50,  rewardCoins: 800, rewardXp: 400, rewardGems: 15, order: 13 },
        { code: 'streak1',   name: 'Streaker',           description: 'Học liên tục 7 ngày',         icon: '🔥', category: 'streak',   conditionType: 'streak',        conditionValue: 7,   rewardCoins: 500, rewardXp: 250, rewardGems: 15, order: 20 },
        { code: 'streak2',   name: 'Ngọn lửa bất diệt', description: 'Duy trì streak 30 ngày',      icon: '🌟', category: 'streak',   conditionType: 'streak',        conditionValue: 30,  rewardCoins: 2000,rewardXp: 1000,rewardGems: 50, order: 21 },
        { code: 'social1',   name: 'Top 10',             description: 'Lọt vào top 10 bảng xếp hạng',icon: '🥇', category: 'social',   conditionType: 'leaderboard',   conditionValue: 10,  rewardCoins: 0,   rewardXp: 0,   rewardGems: 50, order: 30 },
        { code: 'special1',  name: 'Huyền thoại',        description: 'Đạt level 50',                icon: '👑', category: 'skill',    conditionType: 'level',         conditionValue: 50,  rewardCoins: 0,   rewardXp: 0,   rewardGems: 100,order: 40 },
    ];

    let created = 0, skipped = 0;
    for (const d of defaults) {
        const exists = await AchievementDefinition.findOne({ code: d.code });
        if (exists) { skipped++; continue; }
        await AchievementDefinition.create({ ...d, isActive: true });
        created++;
    }
    res.json({ success: true, message: `Seeded ${created} achievements (${skipped} already existed)` });
});

router.post('/seed-quests', admin, async (req, res) => {
    const { seedDefaults } = require('../controllers/questController');
    return seedDefaults(req, res);
});

// ── AI Token Usage (admin) ────────────────────────────────────
// Tổng hợp token đã dùng + cost USD theo từng feature, theo ngày,
// theo user. Phục vụ tab "Token Management" trong admin dashboard.
router.get('/ai-usage', admin, async (req, res) => {
    const AiUsageLog = require('../models/AiUsageLog');
    const User = require('../models/User');

    try {
        const days = Math.max(1, Math.min(parseInt(req.query.days) || 30, 90));
        const since = new Date(Date.now() - days * 86400000);
        const matchRecent = { createdAt: { $gte: since } };
        const providerCatalog = require('../services/aiProviders').listProviders();

        const [overall, byFeature, byProvider, byModel, byDay, recent, allTime] = await Promise.all([
            // Tổng trong khoảng days
            AiUsageLog.aggregate([
                { $match: matchRecent },
                { $group: {
                    _id: null,
                    totalTokens: { $sum: '$totalTokens' },
                    promptTokens: { $sum: '$promptTokens' },
                    completionTokens: { $sum: '$completionTokens' },
                    totalCost: { $sum: '$costUsd' },
                    calls: { $sum: 1 },
                    users: { $addToSet: '$userId' },
                }},
            ]),
            // Theo feature
            AiUsageLog.aggregate([
                { $match: matchRecent },
                { $group: {
                    _id: '$feature',
                    tokens: { $sum: '$totalTokens' },
                    cost: { $sum: '$costUsd' },
                    calls: { $sum: 1 },
                }},
                { $sort: { tokens: -1 } },
            ]),
            // Theo NHÀ CUNG CẤP — log cũ chưa có field provider thì quy về openai
            // (toàn bộ log trước thay đổi này đều là OpenAI).
            AiUsageLog.aggregate([
                { $match: matchRecent },
                { $group: {
                    _id: { $ifNull: ['$provider', 'openai'] },
                    tokens: { $sum: '$totalTokens' },
                    promptTokens: { $sum: '$promptTokens' },
                    completionTokens: { $sum: '$completionTokens' },
                    cost: { $sum: '$costUsd' },
                    calls: { $sum: 1 },
                }},
                { $sort: { cost: -1 } },
            ]),
            // Theo MODEL trong từng nhà cung cấp — biết model nào đang đốt tiền.
            AiUsageLog.aggregate([
                { $match: matchRecent },
                { $group: {
                    _id: { provider: { $ifNull: ['$provider', 'openai'] }, model: '$model' },
                    tokens: { $sum: '$totalTokens' },
                    cost: { $sum: '$costUsd' },
                    calls: { $sum: 1 },
                }},
                { $sort: { cost: -1 } },
            ]),
            // Theo ngày (chart)
            AiUsageLog.aggregate([
                { $match: matchRecent },
                { $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    tokens: { $sum: '$totalTokens' },
                    cost: { $sum: '$costUsd' },
                    calls: { $sum: 1 },
                }},
                { $sort: { _id: 1 } },
            ]),
            // 30 lần gọi gần nhất
            AiUsageLog.find(matchRecent).sort({ createdAt: -1 }).limit(30).lean(),
            // Tổng all-time
            AiUsageLog.aggregate([
                { $group: { _id: null, totalTokens: { $sum: '$totalTokens' }, totalCost: { $sum: '$costUsd' }, calls: { $sum: 1 } } },
            ]),
        ]);

        // Đính email cho recent calls
        const userIds = [...new Set(recent.map(r => String(r.userId)).filter(Boolean))];
        const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('email').lean() : [];
        const userMap = new Map(users.map(u => [String(u._id), u.email]));
        const recentWithEmail = recent.map(r => ({
            ...r,
            email: r.userId ? (userMap.get(String(r.userId)) || '—') : '(system)',
        }));

        const o = overall[0] || {};
        res.json({
            success: true,
            data: {
                days,
                totalTokens: o.totalTokens || 0,
                promptTokens: o.promptTokens || 0,
                completionTokens: o.completionTokens || 0,
                totalCost: o.totalCost || 0,
                calls: o.calls || 0,
                users: (o.users || []).filter(Boolean).length,
                byFeature,
                // Kèm nhãn + tình trạng cấu hình để UI khỏi hardcode tên hãng.
                byProvider: byProvider.map(p => {
                    const meta = providerCatalog.find(x => x.id === p._id);
                    return { ...p, label: meta?.label || p._id, configured: !!meta?.configured };
                }),
                byModel: byModel.map(m => ({
                    provider: m._id.provider, model: m._id.model,
                    tokens: m.tokens, cost: m.cost, calls: m.calls,
                })),
                providers: providerCatalog,
                byDay,
                recent: recentWithEmail,
                allTime: allTime[0] || { totalTokens: 0, totalCost: 0, calls: 0 },
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== Channel config: mỗi kênh chọn danh mục vật phẩm nào để hiển thị =====
const VALID_CHANNELS = ['shop', 'spin', 'quest', 'achievement'];

router.get('/channel-config/:channel', admin, async (req, res) => {
    try {
        const { channel } = req.params;
        if (!VALID_CHANNELS.includes(channel)) return res.status(400).json({ success: false, message: 'Kênh không hợp lệ' });
        const cfg = await ChannelConfig.findOne({ channel }).lean();
        res.json({ success: true, data: { channel, categories: cfg?.categories || [] } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/channel-config/:channel', admin, async (req, res) => {
    try {
        const { channel } = req.params;
        if (!VALID_CHANNELS.includes(channel)) return res.status(400).json({ success: false, message: 'Kênh không hợp lệ' });
        const categories = Array.isArray(req.body.categories) ? req.body.categories.map(String) : [];
        const cfg = await ChannelConfig.findOneAndUpdate(
            { channel },
            { $set: { categories } },
            { new: true, upsert: true }
        );
        res.json({ success: true, message: 'Đã lưu danh mục kênh', data: { channel, categories: cfg.categories } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ===== Hằng số game (GameConfig singleton) =====
const GAME_CONFIG_FIELDS = ['maxUploadWords', 'maxFavorites', 'extendCostPerWord', 'vipBoostCards'];

router.get('/game-config', admin, async (req, res) => {
    try {
        const cfg = await GameConfig.getConfig();
        res.json({ success: true, data: cfg });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/game-config', admin, async (req, res) => {
    try {
        const cfg = await GameConfig.getConfig();
        GAME_CONFIG_FIELDS.forEach(f => {
            if (req.body[f] !== undefined) {
                const n = Number(req.body[f]);
                if (Number.isFinite(n) && n >= 0) cfg[f] = n;
            }
        });
        await cfg.save();
        clearGameConfigCache();
        res.json({ success: true, message: 'Đã lưu hằng số game (áp dụng ngay)', data: cfg });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ===== Mốc mở khoá theo Level (FeatureUnlock) =====
router.get('/feature-unlocks', admin, async (req, res) => {
    try {
        const data = await FeatureUnlock.find().sort({ order: 1, requiredLevel: 1 }).lean();
        res.json({ success: true, data });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/feature-unlocks', admin, async (req, res) => {
    try {
        const data = await FeatureUnlock.create(req.body);
        clearUnlockCache();
        res.status(201).json({ success: true, message: 'Đã tạo mốc mở khoá', data });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/feature-unlocks/:id', admin, async (req, res) => {
    try {
        const { _id, __v, ...fields } = req.body;
        if (fields.requiredLevel !== undefined) fields.requiredLevel = Math.max(1, Number(fields.requiredLevel) || 1);
        const data = await FeatureUnlock.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true, runValidators: true });
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        clearUnlockCache();
        res.json({ success: true, message: 'Đã cập nhật mốc mở khoá', data });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.delete('/feature-unlocks/:id', admin, async (req, res) => {
    try {
        const data = await FeatureUnlock.findByIdAndDelete(req.params.id);
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        clearUnlockCache();
        res.json({ success: true, message: 'Đã xóa mốc mở khoá' });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ===== Cấu hình nhà cung cấp AI =====
// API key vẫn ở .env (không lưu DB); ở đây chỉ chọn hãng + model.

router.get('/ai-config', admin, async (req, res) => {
    try {
        const AiConfig = require('../models/AiConfig');
        const { listProviders, DEFAULT_PROVIDER } = require('../services/aiProviders');
        const cfg = await AiConfig.findOne({ key: 'default' }).lean();
        res.json({
            success: true,
            data: {
                provider: cfg?.provider || DEFAULT_PROVIDER,
                model: cfg?.model || '',
                overrides: cfg?.overrides || {},
                providers: listProviders(),
            },
        });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/ai-config', admin, async (req, res) => {
    try {
        const AiConfig = require('../models/AiConfig');
        const { getProvider } = require('../services/aiProviders');
        const { clearAiConfigCache } = require('../services/aiClient');

        const providerId = String(req.body.provider || '').trim();
        const provider = getProvider(providerId);
        if (!provider) {
            return res.status(400).json({ success: false, message: `Nhà cung cấp không hợp lệ: ${providerId}` });
        }

        const model = String(req.body.model || '').trim();
        if (model && !provider.models[model]) {
            return res.status(400).json({
                success: false,
                message: `${provider.label} không có model "${model}". Chọn: ${Object.keys(provider.models).join(', ')}`,
            });
        }
        // Chặn chọn hãng chưa có key — không thì mọi tính năng AI gãy ngay sau
        // khi lưu, mà lỗi lại chỉ hiện lúc dùng.
        if (!process.env[provider.envKey]) {
            return res.status(400).json({
                success: false,
                message: `Chưa có ${provider.envKey} trong .env nên không dùng được ${provider.label}`,
            });
        }

        const doc = await AiConfig.findOneAndUpdate(
            { key: 'default' },
            { $set: { provider: providerId, model, updatedBy: req.user.id } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
        );
        clearAiConfigCache();
        res.json({
            success: true,
            message: `Đã chuyển sang ${provider.label}${model ? ` · ${model}` : ''} (áp dụng ngay)`,
            data: { provider: doc.provider, model: doc.model },
        });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ===== Tài khoản ngoại lệ (bỏ qua mốc Level, dùng full tính năng) =====
// Cờ nằm trên User.bypassFeatureLock — middleware auth đọc sẵn nên
// requireLevel() không tốn thêm query nào.

router.get('/feature-unlock-exceptions', admin, async (req, res) => {
    try {
        const users = await User.find({ bypassFeatureLock: true })
            .select('email role createdAt').sort({ createdAt: -1 }).lean();
        // Ghép Level + tên hiển thị để admin biết đang miễn cho ai.
        const profiles = await UserProfile.find({ userId: { $in: users.map(u => u._id) } })
            .select('userId username displayName level').lean();
        const byUser = new Map(profiles.map(p => [String(p.userId), p]));
        const data = users.map(u => {
            const p = byUser.get(String(u._id)) || {};
            return {
                _id: u._id,
                email: u.email,
                role: u.role,
                username: p.displayName || p.username || '',
                level: p.level || 1,
            };
        });
        res.json({ success: true, data });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/feature-unlock-exceptions', admin, async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ success: false, message: 'Thiếu email' });

        const user = await User.findOne({ email }).select('email bypassFeatureLock');
        if (!user) return res.status(404).json({ success: false, message: `Không tìm thấy tài khoản: ${email}` });
        if (user.bypassFeatureLock) {
            return res.status(409).json({ success: false, message: `${email} đã ở trong danh sách ngoại lệ` });
        }

        user.bypassFeatureLock = true;
        await user.save();
        res.status(201).json({ success: true, message: `Đã thêm ${email} vào ngoại lệ (mở full tính năng)` });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.delete('/feature-unlock-exceptions/:userId', admin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { $set: { bypassFeatureLock: false } },
            { new: true },
        ).select('email');
        if (!user) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, message: `Đã gỡ ${user.email} khỏi ngoại lệ (áp lại mốc Level)` });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

module.exports = router;
