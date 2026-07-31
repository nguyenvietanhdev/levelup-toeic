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
const Balance = require('../services/balanceService');
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

// Cosmetic + thẻ boost mà gói VIP phát kèm. Gom thành hằng để bước kiểm trước
// khi trừ tiền và bước grant dùng CHUNG một danh sách — hai danh sách rời nhau
// là kiểu để sót đúng cái mình đang phòng.
const VIP_GRANT_IDS = ['bg-vip-week', 'boost-xp-card', 'boost-coins-card'];

/**
 * Mọi itemId mà một lần mua sẽ phát ra — đệ quy qua combo, gồm cả children và
 * gói VIP. Dùng để kiểm TRƯỚC khi trừ tiền.
 *
 * Vì sao cần: `Inventory.grant` ném lỗi khi itemId không có ItemDefinition
 * (inventoryService.js). Trước đây lỗi đó bị nuốt sau khi tiền đã trừ, và
 * response vẫn báo 'Item purchased successfully' — người mua mất tiền, không
 * nhận được gì, không ai biết. Một ký tự gõ nhầm trong trình soạn catalog là đủ.
 */
// Export để test được: đây là logic thuần, và nó là thứ quyết định bước kiểm
// trước khi trừ tiền có sót đường phát nào không — sót một đường là quay lại
// đúng bug cũ. Cùng lý do `itemDefRules.js` tách ra khỏi route.
exports._collectGrantedItemIds = collectGrantedItemIds;
function collectGrantedItemIds(item, isCard) {
    const ids = new Set();
    if (isCard) ids.add(item.itemId);

    (function walk(effect) {
        if (!effect) return;
        if (effect.type === 'item' && effect.itemId) ids.add(effect.itemId);
        else if (effect.type === 'combo' && Array.isArray(effect.items)) effect.items.forEach(walk);
    })(item.effect);

    if (Array.isArray(item.children)) {
        for (const c of item.children) if (c?.itemId) ids.add(c.itemId);
    }
    if (item.effect?.type === 'vip' || item.category === 'vip') {
        VIP_GRANT_IDS.forEach(id => ids.add(id));
    }
    return [...ids];
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

        // Bản đọc này CHỈ dùng cho các cửa kiểm trước khi trừ tiền (đầy năng lượng,
        // boost yếu hơn, cooldown). Sau khi trừ, `stats` được thay bằng doc atomic
        // trả về — xem chỗ Balance.debit bên dưới.
        let stats = await UserStats.findOne({ userId: req.user.id });
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
        // "Thẻ" (durationType 'on_use') nằm trong kho chứ không áp hiệu ứng ngay
        // lúc mua — cần biết sớm vì nó đổi danh sách vật phẩm sẽ phát.
        const isCard = item.durationType === 'on_use';

        // ── KIỂM TRƯỚC KHI TRỪ TIỀN ─────────────────────────────────────────
        // Mọi itemId sắp phát phải có ItemDefinition. Nếu thiếu, `Inventory.grant`
        // sẽ ném lỗi — mà lúc đó tiền đã trừ xong rồi. Chặn ở đây thì khoản tiền
        // không bao giờ rời tài khoản. Đây là nguyên nhân thực tế của
        // SEC-be.economy-003: một itemId gõ nhầm trong catalog.
        const grantIds = collectGrantedItemIds(item, isCard);
        if (grantIds.length) {
            const found = await ItemDefinition.find({ itemId: { $in: grantIds } }).select('itemId').lean();
            const missing = grantIds.filter(id => !found.some(d => d.itemId === id));
            if (missing.length) {
                logger.error('Catalog hỏng — vật phẩm sắp phát không tồn tại:', { itemId, missing });
                return res.status(409).json({
                    success: false,
                    message: 'Sản phẩm này đang cấu hình sai, chưa mua được. Vui lòng báo quản trị viên.',
                });
            }
        }

        const unitPrice = unitPriceAfterDiscount(item);
        const totalPrice = unitPrice * units;

        // Trừ tiền ATOMIC: điều kiện đủ tiền nằm TRONG filter nên hai request song
        // song không thể cùng qua cửa. Trước đây đọc → kiểm → trừ trên bản in-memory
        // → save(), mua song song là nhân đôi vật phẩm mà chỉ mất tiền một lần.
        //
        // Từ đây trở đi PHẢI dùng doc trả về: save() trên bản đọc lúc đầu sẽ ghi đè
        // số dư bằng giá trị trước khi trừ.
        const debited = await Balance.debit(req.user.id, item.currency, totalPrice);
        if (!debited) {
            return res.status(400).json({
                success: false,
                message: item.currency === 'coins' ? 'Not enough coins' : 'Not enough gems',
            });
        }
        stats = debited;

        // Thẻ mua về nằm trong kho để người chơi tự chọn lúc kích hoạt — đó là
        // toàn bộ ý nghĩa của thẻ; áp hiệu ứng ngay lúc mua thì thẻ mua lúc nửa
        // đêm cháy vô ích. Các loại khác (gói tài nguyên, VIP, nạp ⚡) áp thẳng.
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

        // ── PHÁT VẬT PHẨM ───────────────────────────────────────────────────
        // Ba khối này trước đây là ba try/catch riêng, mỗi cái chỉ ghi log rồi
        // đi tiếp, và response cuối vẫn báo 'Item purchased successfully'. Người
        // mua mất tiền, không nhận được gì, và dấu vết duy nhất là một dòng log.
        //
        // Giờ gộp một khối: hỏng thì HOÀN TIỀN và trả lỗi thật. Nguyên nhân phổ
        // biến nhất (itemId không tồn tại) đã bị chặn ở bước kiểm trước khi trừ,
        // nên tới được đây gần như chắc chắn là sự cố hạ tầng.
        try {
            if (isCard) await Inventory.grant(req.user.id, itemId, units, { source: 'shop' });
            for (let i = 0; i < units; i++) await grantItemsFromEffect(req.user.id, item.effect);

            // Vật phẩm con (combo mới) — grant child.quantity × tổng đơn vị.
            for (const c of (item.children || [])) {
                if (c.itemId) await Inventory.grant(req.user.id, c.itemId, (c.quantity || 1) * units, { source: 'shop' });
            }

            // VIP → grant + tự trang bị nền cosmetic (hạn = VIP), kèm thẻ boost.
            if (item.effect?.type === 'vip' || item.category === 'vip') {
                await Inventory.grant(req.user.id, 'bg-vip-week', 1, {
                    source: 'vip',
                    expiresAt: stats.vipExpiresAt || null,
                });
                await Inventory.equip(req.user.id, 'bg-vip-week');
                const VIP_BOOST_CARDS = (await getGameConfig()).vipBoostCards;
                await Inventory.grant(req.user.id, 'boost-xp-card', VIP_BOOST_CARDS, { source: 'vip' });
                await Inventory.grant(req.user.id, 'boost-coins-card', VIP_BOOST_CARDS, { source: 'vip' });
            }
        } catch (e) {
            logger.error('Grant thất bại sau khi đã trừ tiền — hoàn lại:', { itemId, error: e.message });
            try {
                await Balance.credit(req.user.id, item.currency, totalPrice);
            } catch (refundErr) {
                // Hoàn cũng hỏng: đây là thứ PHẢI xử tay, nên log riêng cho dễ tìm.
                logger.error('HOÀN TIỀN THẤT BẠI — cần xử lý thủ công:', {
                    userId: String(req.user.id), itemId, amount: totalPrice,
                    currency: item.currency, error: refundErr.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: 'Mua không thành công, đã hoàn lại số tiền đã trừ. Vui lòng thử lại.',
            });
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
