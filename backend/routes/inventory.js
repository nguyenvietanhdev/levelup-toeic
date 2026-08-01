const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const ItemDefinition = require('../models/ItemDefinition');
const UserStats = require('../models/UserStats');
const Inventory = require('../services/inventoryService');
const { applyShopEffect, boostBlockReason } = require('../services/shopEffects');
const validate = require('../middleware/validate');
const { inventoryItem, inventorySlot } = require('../validators/schemas');

// Catalog công khai — danh sách item đang bật.
router.get('/items', async (req, res, next) => {
    try {
        const items = await ItemDefinition.find({ isActive: true }).sort({ type: 1, order: 1 }).lean();
        res.json({ success: true, data: items });
    } catch (err) { next(err); }
});

// Túi đồ của tôi (kèm slot đang trang bị).
router.get('/', protect, async (req, res, next) => {
    try {
        const [items, equipped] = await Promise.all([
            Inventory.getInventory(req.user.id),
            Inventory.getEquipped(req.user.id),
        ]);
        res.json({ success: true, data: items, equipped });
    } catch (err) { next(err); }
});

// Dùng / kích hoạt đồ. on_use (thẻ boost) → tiêu 1 + áp hiệu ứng vào UserStats.
router.post('/use', protect, validate(inventoryItem), async (req, res, next) => {
    try {
        const { itemId } = req.body;

        const def = await ItemDefinition.findOne({ itemId }).lean();
        if (!def) return res.status(404).json({ success: false, message: 'Item không tồn tại' });

        // Chặn TRƯỚC khi trừ thẻ: đang chạy x3 mà bấm x2 thì thẻ x2 sẽ chẳng làm
        // gì — tiêu nó là mất trắng. Chỉ một hiệu ứng mỗi loại được chạy.
        if (def.effect?.type === 'boost') {
            const cur = await UserStats.findOne({ userId: req.user.id })
                .select('xpBoostActive xpBoostMultiplier xpBoostExpiresAt coinsBoostActive coinsBoostMultiplier coinsBoostExpiresAt energyBoostActive energyBoostMultiplier energyBoostExpiresAt')
                .lean();
            const blocked = cur && boostBlockReason(cur, def.effect);
            if (blocked) return res.status(409).json({ success: false, message: blocked });
        }

        // Kiểm dùng-được-hay-không TRƯỚC khi trừ đồ. Trước đây bước này nằm SAU
        // `consume`, nên bấm "dùng" một món không dùng được (cosmetic, item
        // không phải on_use, effect rỗng) là món đó bị trừ, không hiệu ứng gì,
        // không hoàn lại — và response vẫn trả `success: true`.
        // Xem SEC-be.economy-004.
        if (def.durationType !== 'on_use' || !def.effect?.type) {
            return res.status(400).json({ success: false, message: 'Vật phẩm này không dùng được' });
        }

        // UserStats thiếu thì cũng phải chặn TRƯỚC khi trừ: nhánh `if (stats)`
        // bên dưới không có `else`, nên trước đây món vẫn mất mà chẳng áp gì.
        const statsExists = await UserStats.exists({ userId: req.user.id });
        if (!statsExists) return res.status(404).json({ success: false, message: 'User not found' });

        const ok = await Inventory.consume(req.user.id, itemId, 1);
        if (!ok) return res.status(400).json({ success: false, message: 'Bạn không có vật phẩm này' });

        // Tới đây chắc chắn là on_use có effect (đã chặn ở trên) và UserStats
        // tồn tại — nên không còn nhánh `if` nào nuốt lặng trường hợp hỏng.
        const stats = await UserStats.findOne({ userId: req.user.id });
        applyShopEffect(stats, def.effect);
        await stats.save();

        // Thẻ hồi ⚡ đổi thẳng tài nguyên → phải trả số mới, không thì client
        // giữ số cũ rồi saveState ghi đè mất phần vừa hồi.
        const resources = {
            energy: stats.energy, maxEnergy: stats.maxEnergy,
            coins: stats.coins, gems: stats.gems,
            hints: stats.hints, shields: stats.shields, timeFreezes: stats.timeFreezes,
            lastEnergyUpdate: stats.lastEnergyUpdate,
        };
        const boosts = {
            xp: { active: stats.xpBoostActive, multiplier: stats.xpBoostMultiplier, expiresAt: stats.xpBoostExpiresAt },
            coins: { active: stats.coinsBoostActive, multiplier: stats.coinsBoostMultiplier, expiresAt: stats.coinsBoostExpiresAt },
            energy: { active: stats.energyBoostActive, multiplier: stats.energyBoostMultiplier, expiresAt: stats.energyBoostExpiresAt },
        };
        res.json({ success: true, boosts, resources });
    } catch (err) { next(err); }
});

// Trang bị cosmetic.
router.post('/equip', protect, validate(inventoryItem), async (req, res, next) => {
    try {
        const { itemId } = req.body;
        const result = await Inventory.equip(req.user.id, itemId);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Bỏ trang bị theo slot.
router.post('/unequip', protect, validate(inventorySlot), async (req, res, next) => {
    try {
        const { slot } = req.body;
        const result = await Inventory.unequip(req.user.id, slot);
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
});

module.exports = router;
