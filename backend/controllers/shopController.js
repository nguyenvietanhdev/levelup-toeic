// ===================================
// SHOP CONTROLLER
// ===================================
// Split out of userStateController (P4). Self-contained: ShopItem +
// UserStats models, the shopEffects service, and logger — no userState
// helpers. Verbatim move; behaviour unchanged. routes/shop.js imports
// these from here now.

const jwt = require('jsonwebtoken');
const UserStats = require('../models/UserStats');
const logger = require('../utils/logger');
const { applyShopEffect, boostBlockReason } = require('../services/shopEffects');
const Inventory = require('../services/inventoryService');
const Transaction = require('../models/Transaction');
const ItemDefinition = require('../models/ItemDefinition');
const ChannelConfig = require('../models/ChannelConfig');
const { getGameConfig } = require('../services/gameConfig');

// Cửa hàng đọc THẲNG từ catalog (item_definitions): sản phẩm = item đã xuất bản,
// có giá (>0), thuộc danh mục mà kênh 'shop' đã chọn. Engine mua giữ nguyên.
async function shopCategories() {
    const cfg = await ChannelConfig.findOne({ channel: 'shop' }).lean();
    return cfg?.categories || [];
}

// Grant vật phẩm inventory từ effect (đệ quy qua combo). Dùng chung: shop + quest.
async function grantItemsFromEffect(userId, effect, source = 'shop') {
    if (!effect) return;
    if (effect.type === 'item' && effect.itemId) {
        await Inventory.grant(userId, effect.itemId, effect.amount || 1, { source });
    } else if (effect.type === 'combo' && Array.isArray(effect.items)) {
        for (const sub of effect.items) await grantItemsFromEffect(userId, sub, source);
    }
}

// Đơn giá sau giảm (1 đơn vị). Tổng giá 1 gói = perUnit × quantity.
function unitPriceAfterDiscount(item) {
    return item.discountPercent > 0
        ? Math.floor(item.price * (1 - item.discountPercent / 100))
        : item.price;
}

// Hết hạn "lười": tới hạn thì tự áp afterExpiry (persist DB). Trả về item đã điều chỉnh
// (published/discountPercent/saleEndsAt) để dùng ngay. Không hết hạn → trả nguyên.
async function resolveExpiry(item) {
    if (!item.saleEndsAt || Date.now() < new Date(item.saleEndsAt).getTime()) return item;
    if (item.afterExpiry === 'revert') {
        await ItemDefinition.updateOne({ _id: item._id }, { $set: { discountPercent: 0, saleEndsAt: null } });
        return { ...item, discountPercent: 0, saleEndsAt: null };
    }
    // 'unpublish' — đóng xuất bản
    await ItemDefinition.updateOne({ _id: item._id }, { $set: { published: false, saleEndsAt: null } });
    return { ...item, published: false, saleEndsAt: null };
}

// Vật phẩm giới hạn theo chu kỳ: itemId → số ngày phải chờ giữa 2 lần mua.
// (Cũng tôn trọng item.cooldownDays nếu được đặt trong DB.)
const COOLDOWN_DAYS = { 'shields-pack': 7 };

exports.getShopItems = async (req, res, next) => {
    try {
        const cats = await shopCategories();
        let items = cats.length
            ? await ItemDefinition.find({
                published: true, isActive: true,
                price: { $gt: 0 }, category: { $in: cats },
            }).sort({ order: 1 }).lean()
            : [];

        // Áp hết hạn "lười": item tới hạn → tự unpublish/revert. Bỏ item vừa bị unpublish.
        items = (await Promise.all(items.map(resolveExpiry))).filter(it => it.published !== false);

        // Đính tổng giá gói (quantity × đơn giá sau giảm) để client hiển thị.
        items = items.map(it => ({
            ...it,
            unitPrice: unitPriceAfterDiscount(it),
            totalPrice: unitPriceAfterDiscount(it) * (it.quantity || 1),
        }));

        // Route /items công khai (không bắt buộc đăng nhập). Nếu có token hợp lệ
        // thì đọc cooldown của user để client vô hiệu hoá nút + đếm ngược.
        let cooldownMap = null;
        try {
            const auth = req.headers.authorization || '';
            if (auth.startsWith('Bearer ')) {
                const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
                const stats = await UserStats.findOne({ userId: decoded.id }).select('shopCooldowns').lean();
                cooldownMap = stats?.shopCooldowns || null; // lean → object thường
            }
        } catch (_) { /* token sai/hết hạn → coi như khách, bỏ qua cooldown */ }

        const now = Date.now();
        const withCd = items.map(it => {
            const days = it.cooldownDays || COOLDOWN_DAYS[it.itemId] || 0;
            if (!days) return it;
            const last = cooldownMap
                ? (cooldownMap instanceof Map ? cooldownMap.get(it.itemId) : cooldownMap[it.itemId])
                : null;
            let nextAvailableAt = null;
            if (last) {
                const t = new Date(last).getTime() + days * 86400000;
                if (t > now) nextAvailableAt = new Date(t);
            }
            return { ...it, cooldownDays: days, nextAvailableAt };
        });

        // Ảnh CATALOG thắng: item bán 1 vật phẩm (effect type 'item') → lấy ảnh từ
        // ItemDefinition. Vật phẩm chỉ set ảnh 1 chỗ (Catalog), thẻ shop tự khớp.
        const grantIds = [...new Set(withCd.map(it => it.effect?.type === 'item' && it.effect.itemId).filter(Boolean))];
        if (grantIds.length) {
            const defs = await ItemDefinition.find({ itemId: { $in: grantIds } }).select('itemId image').lean();
            const dmap = new Map(defs.map(d => [d.itemId, d]));
            withCd.forEach(it => {
                if (it.effect?.type === 'item' && it.effect.itemId) {
                    const img = dmap.get(it.effect.itemId)?.image;
                    if (img) it.image = img; // catalog thắng ảnh shop
                }
            });
        }

        res.json({ success: true, items: withCd });
    } catch (error) {
        logger.error('Error in getShopItems:', error);
        next(error);
    }
};

exports.purchaseItem = async (req, res, next) => {
    try {
        const { itemId } = req.body;
        if (!itemId) return res.status(400).json({ success: false, message: 'Item ID is required' });

        let item = await ItemDefinition.findOne({ itemId, isActive: true, published: true, price: { $gt: 0 } }).lean();
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
        item = await resolveExpiry(item); // tới hạn khuyến mãi → unpublish/revert ngay
        if (item.published === false) return res.status(410).json({ success: false, message: 'Sản phẩm đã hết hạn bày bán' });

        const stats = await UserStats.findOne({ userId: req.user.id });
        if (!stats) return res.status(404).json({ success: false, message: 'User not found' });

        // Giới hạn mua theo chu kỳ (vd Gói Khiên Bảo Vệ: 1 lần/tuần).
        const cooldownDays = item.cooldownDays || COOLDOWN_DAYS[itemId] || 0;

        // Số gói mua (1–99). Vật phẩm có cooldown → ép về 1.
        let quantity = Math.max(1, Math.min(99, parseInt(req.body.quantity, 10) || 1));
        if (cooldownDays > 0) quantity = 1;

        // "Nạp đầy" chỉ có nghĩa một lần: mua 2 gói vẫn chỉ đầy bình mà mất tiền
        // gấp đôi, và mua lúc đang đầy là mất tiền lấy không. Chặn cả hai ở đây
        // thay vì tin client gửi đúng.
        if (item.effect?.type === 'energy_full') {
            quantity = 1;
            if (stats.energy >= stats.maxEnergy) {
                return res.status(400).json({
                    success: false,
                    message: 'Năng lượng đang đầy — chưa cần nạp',
                });
            }
        }
        // Boost áp THẲNG lúc mua (không phải thẻ) mà yếu hơn cái đang chạy thì
        // mua về chỉ mất tiền: chặn trước khi trừ xu. Thẻ (on_use) không chặn ở
        // đây — thẻ để trong túi tới lúc rảnh mới bật, route /inventory/use mới
        // là chỗ kiểm.
        if (item.effect?.type === 'boost' && item.durationType !== 'on_use') {
            const blocked = boostBlockReason(stats, item.effect);
            if (blocked) return res.status(409).json({ success: false, message: blocked });
        }

        // Số đơn vị/gói (bundle) → tổng đơn vị nhận = bundle × số gói. Nhân cả giá lẫn đồ.
        const bundle = item.quantity || 1;
        const units = bundle * quantity;
        if (cooldownDays > 0) {
            const last = stats.shopCooldowns?.get(itemId);
            if (last) {
                const nextAt = new Date(last).getTime() + cooldownDays * 86400000;
                if (Date.now() < nextAt) {
                    const daysLeft = Math.ceil((nextAt - Date.now()) / 86400000);
                    return res.status(429).json({
                        success: false,
                        message: `Vật phẩm này chỉ mua được ${cooldownDays} ngày/lần. Vui lòng chờ thêm ${daysLeft} ngày.`,
                        nextAvailableAt: new Date(nextAt),
                    });
                }
            }
        }

        // Tổng giá = đơn giá sau giảm × tổng đơn vị (bundle × số gói).
        const unitPrice = unitPriceAfterDiscount(item);
        const totalPrice = unitPrice * units;

        if (item.currency === 'coins' && stats.coins < totalPrice) {
            return res.status(400).json({ success: false, message: 'Not enough coins' });
        }
        if (item.currency === 'gems' && stats.gems < totalPrice) {
            return res.status(400).json({ success: false, message: 'Not enough gems' });
        }

        if (item.currency === 'coins') stats.coins -= totalPrice;
        else stats.gems -= totalPrice;

        // "Thẻ" (durationType 'on_use') mua về phải NẰM TRONG KHO để người chơi
        // tự chọn lúc kích hoạt — đó là toàn bộ ý nghĩa của thẻ. Áp hiệu ứng
        // ngay lúc mua thì thẻ mua lúc nửa đêm cháy vô ích. Các loại khác
        // (gói tài nguyên, VIP, nạp ⚡) vẫn áp thẳng như cũ.
        const isCard = item.durationType === 'on_use';
        if (!isCard) {
            // Áp hiệu ứng theo TỔNG đơn vị (consumable cộng dồn; VIP cộng dồn hạn).
            for (let i = 0; i < units; i++) applyShopEffect(stats, item.effect);
        }

        // Ghi mốc thời gian mua để áp cooldown cho lần sau.
        if (cooldownDays > 0) {
            if (!stats.shopCooldowns) stats.shopCooldowns = new Map();
            stats.shopCooldowns.set(itemId, new Date());
        }

        await stats.save();

        // Grant vật phẩm inventory theo TỔNG đơn vị (effect type 'item' / combo) — vd Vé quay.
        try {
            if (isCard) await Inventory.grant(req.user.id, itemId, units, { source: 'shop' });
            for (let i = 0; i < units; i++) await grantItemsFromEffect(req.user.id, item.effect);
        } catch (e) {
            logger.error('Grant inventory item failed:', e.message);
        }

        // Vật phẩm con (combo mới) — grant child.quantity × tổng đơn vị.
        if (Array.isArray(item.children) && item.children.length) {
            try {
                for (const c of item.children) {
                    if (c.itemId) await Inventory.grant(req.user.id, c.itemId, (c.quantity || 1) * units, { source: 'shop' });
                }
            } catch (e) {
                logger.error('Grant combo children failed:', e.message);
            }
        }

        // VIP → grant + tự trang bị nền cosmetic (hạn = VIP). Best-effort:
        // lỗi inventory không được làm hỏng giao dịch mua đã lưu.
        if (item.effect?.type === 'vip' || item.category === 'vip') {
            try {
                await Inventory.grant(req.user.id, 'bg-vip-week', 1, {
                    source: 'vip',
                    expiresAt: stats.vipExpiresAt || null,
                });
                await Inventory.equip(req.user.id, 'bg-vip-week');
                // Thay auto-boost: phát thẻ x2 XP + x2 Coins (on_use) — tự kích hoạt.
                const VIP_BOOST_CARDS = (await getGameConfig()).vipBoostCards;
                await Inventory.grant(req.user.id, 'boost-xp-card', VIP_BOOST_CARDS, { source: 'vip' });
                await Inventory.grant(req.user.id, 'boost-coins-card', VIP_BOOST_CARDS, { source: 'vip' });
            } catch (e) {
                logger.error('VIP grant failed:', e.message);
            }
        }

        // Ghi lịch sử giao dịch (collection riêng, không giới hạn).
        let txn = null;
        try {
            const isExchange = item.category === 'exchange';
            const doc = await Transaction.create({
                userId: req.user.id,
                type: isExchange ? 'exchange' : 'purchase',
                name: `${isExchange ? '' : 'Mua '}${item.name}${quantity > 1 ? ` ×${quantity}` : ''}`,
                itemId,
                amount: totalPrice,
                currency: item.currency,
                balanceAfter: item.currency === 'coins' ? stats.coins : stats.gems,
            });
            txn = { at: doc.at, name: doc.name, amount: doc.amount, currency: doc.currency, balanceAfter: doc.balanceAfter };
        } catch (e) {
            logger.error('Transaction log failed:', e.message);
        }

        // Đọc lại tài nguyên SAU khi grant (item 'resource' như hint/shield được
        // cộng qua Inventory.grant → updateOne, không nằm trên `stats` in-memory).
        const fresh = await UserStats.findOne({ userId: req.user.id })
            .select('coins gems energy hints shields timeFreezes').lean() || stats;

        res.json({
            success: true,
            message: 'Item purchased successfully',
            // Trả về ĐẦY ĐỦ tài nguyên sau khi áp hiệu ứng, để client đồng bộ
            // local — tránh save() sau đó ghi đè số cũ làm mất đồ vừa mua.
            data: {
                item,
                transaction: txn,
                newBalance: {
                    coins: fresh.coins,
                    gems: fresh.gems,
                    energy: fresh.energy,
                    hints: fresh.hints,
                    shields: fresh.shields,
                    timeFreezes: fresh.timeFreezes,
                },
            },
        });
    } catch (error) {
        logger.error('Error in purchaseItem:', error);
        next(error);
    }
};
