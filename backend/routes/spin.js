const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const UserSpin = require('../models/UserSpin');
const UserStats = require('../models/UserStats');
const UserProfile = require('../models/UserProfile');
const SpinConfig = require('../models/SpinConfig');
const { applyLevelUp } = require('../utils/userStateHelper');
const ItemDefinition = require('../models/ItemDefinition');
const ChannelConfig = require('../models/ChannelConfig');
const Inventory = require('../services/inventoryService');
const logger = require('../utils/logger');
const { logTxn } = require('../utils/economyLog');
const { requireLevel } = require('../services/featureUnlock');

const SPIN_TICKET = 'spin-ticket';

// Cổng lọc: prize kiểu 'item' chỉ SỐNG nếu item đã xuất bản & danh mục thuộc
// danh mục kênh 'spin' đã tick. Tiền tệ (coins/gems/xp/energy/hints) luôn giữ.
// Cache TTL 30s để admin đổi published/danh mục là áp dụng nhanh, không cần restart.
let _gate = { at: 0, cats: null, itemMap: null };
async function getGate() {
    if (_gate.cats && Date.now() - _gate.at < 30000) return _gate;
    const [cfg, items] = await Promise.all([
        ChannelConfig.findOne({ channel: 'spin' }).lean(),
        ItemDefinition.find({}, 'itemId published category image').lean(),
    ]);
    _gate = {
        at: Date.now(),
        cats: new Set(cfg?.categories || []),
        itemMap: new Map(items.map(i => [i.itemId, i])),
    };
    return _gate;
}

// publicPrize + resolve ẢNH cho prize kiểu 'item' TỪ CATALOG (không dùng ảnh tải riêng).
// Tiền tệ dùng icon → không ảnh.
async function publicPrizesResolved(prizes) {
    const { itemMap } = await getGate();
    return prizes.map(p => {
        const base = publicPrize(p);
        base.image = (p.type === 'item' && p.itemId) ? (itemMap.get(p.itemId)?.image || '') : '';
        return base;
    });
}
async function livePrizes(prizes) {
    const { cats, itemMap } = await getGate();
    const live = prizes.filter(p => {
        if (p.type !== 'item') return true;
        const it = itemMap.get(p.itemId);
        return it && it.published !== false && cats.has(it.category);
    });
    return live.length ? live : prizes; // đề phòng lọc sạch → giữ nguyên
}

const admin = [protect, authorize('admin')];

// Cache config trong RAM — xoá khi admin lưu.
let _cfgCache = null;
async function getCfg() {
    if (_cfgCache) return _cfgCache;
    _cfgCache = await SpinConfig.getConfig();
    return _cfgCache;
}

// Chọn phần thưởng theo TRỌNG SỐ (prob[mode]) — tự chuẩn hoá.
function pickPrizeIndex(prizes, mode) {
    const weights = prizes.map(p => Math.max(0, p.prob?.[mode] ?? 0));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return Math.floor(Math.random() * prizes.length);
    let r = Math.random() * total;
    for (let i = 0; i < prizes.length; i++) {
        r -= weights[i];
        if (r < 0) return i;
    }
    return prizes.length - 1;
}

// Chỉ gửi field hiển thị ra client (giấu tỷ lệ).
function publicPrize(p) {
    return { type: p.type, amount: p.amount, itemId: p.itemId, label: p.label, icon: p.icon, image: p.image || '', color: p.color };
}

function msUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight - now;
}

router.get('/status', protect, async (req, res) => {
    try {
        const [spin, stats, cfg, tickets] = await Promise.all([
            UserSpin.findOne({ userId: req.user.id }).lean(),
            UserStats.findOne({ userId: req.user.id }).select('coins gems').lean(),
            getCfg(),
            Inventory.count(req.user.id, SPIN_TICKET),
        ]);

        let canFreeSpin = true, nextSpinAt = null;
        if (spin?.lastSpinAt) {
            const lastMidnight = new Date(spin.lastSpinAt);
            lastMidnight.setHours(0, 0, 0, 0);
            const todayMidnight = new Date();
            todayMidnight.setHours(0, 0, 0, 0);
            canFreeSpin = lastMidnight < todayMidnight;
            if (!canFreeSpin) nextSpinAt = new Date(Date.now() + msUntilMidnight());
        }

        res.json({
            success: true,
            canSpin: canFreeSpin,  // backward compat
            canFreeSpin,
            nextSpinAt,
            totalSpins: spin?.totalSpins || 0,
            coins: stats?.coins || 0,
            gems: stats?.gems || 0,
            tickets,
            costs: cfg.costs,
            prizes: await publicPrizesResolved(await livePrizes(cfg.prizes)),
        });
    } catch (err) {
        logger.error('Spin status error:', err);
        res.status(500).json({ success: false, message: 'Lỗi kiểm tra trạng thái' });
    }
});

router.post('/', protect, requireLevel('feature:spin'), async (req, res) => {
    try {
        const userId = req.user.id;
        const mode = ['free', 'coin', 'gem', 'ticket'].includes(req.body.mode) ? req.body.mode : 'free';

        const [spin, stats, cfg] = await Promise.all([
            UserSpin.findOne({ userId }),
            UserStats.findOne({ userId }),
            getCfg(),
        ]);
        const cost = cfg.costs;
        const prizes = await livePrizes(cfg.prizes); // cùng danh sách với /status

        if (mode === 'free') {
            if (spin?.lastSpinAt) {
                const lastMidnight = new Date(spin.lastSpinAt);
                lastMidnight.setHours(0, 0, 0, 0);
                const todayMidnight = new Date();
                todayMidnight.setHours(0, 0, 0, 0);
                if (lastMidnight >= todayMidnight) {
                    return res.status(429).json({ success: false, message: 'Bạn đã quay miễn phí hôm nay rồi!' });
                }
            }
        } else if (mode === 'coin') {
            if ((stats?.coins || 0) < cost.coin) {
                return res.status(400).json({ success: false, message: `Không đủ xu! Cần ${cost.coin} xu.` });
            }
        } else if (mode === 'gem') {
            if ((stats?.gems || 0) < cost.gem) {
                return res.status(400).json({ success: false, message: `Không đủ đá quý! Cần ${cost.gem} đá.` });
            }
        } else if (mode === 'ticket') {
            // Tiêu 1 vé ATOMIC trước khi quay; thiếu vé → dừng.
            const ok = await Inventory.consume(userId, SPIN_TICKET, 1);
            if (!ok) {
                return res.status(400).json({ success: false, message: 'Bạn không có Vé quay may mắn!' });
            }
        }

        // Tỷ lệ: mode 'ticket' dùng bảng của 'free' (quay như lượt thường).
        const prizeMode = mode === 'ticket' ? 'free' : mode;
        const prizeIndex = pickPrizeIndex(prizes, prizeMode);
        const prize = prizes[prizeIndex];

        // Áp dụng phần thưởng + trừ chi phí
        const rewardUpdate = {};
        if (prize.type === 'coins')  rewardUpdate.$inc = { coins: prize.amount };
        if (prize.type === 'gems')   rewardUpdate.$inc = { gems: prize.amount };
        if (prize.type === 'xp')     rewardUpdate.$inc = { xp: prize.amount, totalXp: prize.amount };
        if (prize.type === 'hints')  rewardUpdate.$inc = { hints: prize.amount };
        if (prize.type === 'energy') rewardUpdate.$set = { energy: prize.amount, lastEnergyUpdate: new Date() };

        if (mode === 'coin') {
            rewardUpdate.$inc = { ...(rewardUpdate.$inc || {}), coins: (rewardUpdate.$inc?.coins || 0) - cost.coin };
        }
        if (mode === 'gem') {
            rewardUpdate.$inc = { ...(rewardUpdate.$inc || {}), gems: (rewardUpdate.$inc?.gems || 0) - cost.gem };
        }

        const upStats = await UserStats.findOneAndUpdate({ userId }, rewardUpdate, { new: true }).lean();

        // Log kinh tế: chi phí quay (out) + tiền thắng (in).
        if (mode === 'coin' && cost.coin) logTxn(userId, { type: 'spin', direction: 'out', name: 'Vòng quay (xu)', amount: cost.coin, currency: 'coins', balanceAfter: upStats?.coins || 0 });
        if (mode === 'gem' && cost.gem)  logTxn(userId, { type: 'spin', direction: 'out', name: 'Vòng quay (đá)', amount: cost.gem, currency: 'gems', balanceAfter: upStats?.gems || 0 });
        if (prize.type === 'coins') logTxn(userId, { type: 'spin', direction: 'in', name: 'Trúng Vòng quay', amount: prize.amount, currency: 'coins', balanceAfter: upStats?.coins || 0 });
        if (prize.type === 'gems')  logTxn(userId, { type: 'spin', direction: 'in', name: 'Trúng Vòng quay', amount: prize.amount, currency: 'gems', balanceAfter: upStats?.gems || 0 });

        // Trúng XP: $inc ở trên chỉ cộng xp, chưa áp lên cấp. Áp NGAY để level
        // khớp xp (khoá tính năng đọc UserProfile.level). Xem awardXp/applyLevelUp.
        if (prize.type === 'xp' && prize.amount > 0) {
            const [profile, statsDoc] = await Promise.all([
                UserProfile.findOne({ userId }),
                UserStats.findOne({ userId }),
            ]);
            if (profile && statsDoc) {
                const r = applyLevelUp(profile, statsDoc);
                if (r.leveledUp) {
                    statsDoc.coins += r.coinsReward;
                    await Promise.all([profile.save(), statsDoc.save()]);
                }
            }
        }

        // Phần thưởng là VẬT PHẨM inventory (dùng chung kho với shop/quest).
        if (prize.type === 'item' && prize.itemId) {
            try {
                await Inventory.grant(userId, prize.itemId, prize.amount || 1, { source: 'spin' });
            } catch (e) {
                logger.error('Spin item grant failed:', e.message);
            }
        }

        if (mode === 'free') {
            await UserSpin.findOneAndUpdate(
                { userId },
                { lastSpinAt: new Date(), $inc: { totalSpins: 1 } },
                { upsert: true }
            );
        } else {
            await UserSpin.findOneAndUpdate({ userId }, { $inc: { totalSpins: 1 } }, { upsert: true });
        }

        const nextSpinAt = mode === 'free' ? new Date(Date.now() + msUntilMidnight()) : null;
        const [prizeResolved] = await publicPrizesResolved([prize]);
        res.json({ success: true, prizeIndex, prize: prizeResolved, mode, nextSpinAt });
    } catch (err) {
        logger.error('Spin error:', err);
        res.status(500).json({ success: false, message: 'Lỗi quay thưởng' });
    }
});

// ── Admin: cấu hình phần thưởng + tỷ lệ ──
router.get('/config', admin, async (req, res, next) => {
    try {
        const cfg = await SpinConfig.getConfig();
        res.json({ success: true, data: cfg });
    } catch (e) { next(e); }
});

router.put('/config', admin, async (req, res, next) => {
    try {
        const { costs, prizes } = req.body;
        const cfg = await SpinConfig.getConfig();

        if (costs) {
            cfg.costs = {
                coin: Number(costs.coin) > 0 ? Number(costs.coin) : cfg.costs.coin,
                gem: Number(costs.gem) > 0 ? Number(costs.gem) : cfg.costs.gem,
            };
        }
        if (Array.isArray(prizes) && prizes.length > 0) {
            cfg.prizes = prizes.map(p => ({
                type: p.type,
                amount: Number(p.amount) || 0,
                itemId: p.type === 'item' ? String(p.itemId || '') : '',
                label: String(p.label || ''),
                icon: p.icon || '🎁',
                image: String(p.image || ''),
                color: p.color || '#888888',
                prob: {
                    free: Math.max(0, Number(p.prob?.free) || 0),
                    coin: Math.max(0, Number(p.prob?.coin) || 0),
                    gem: Math.max(0, Number(p.prob?.gem) || 0),
                },
            }));
        }
        await cfg.save();
        _cfgCache = null; // xoá cache để áp dụng ngay
        res.json({ success: true, message: 'Đã lưu cấu hình vòng quay', data: cfg });
    } catch (e) { next(e); }
});

module.exports = router;
