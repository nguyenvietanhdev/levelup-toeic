const InventoryItem = require('../models/InventoryItem');
const ItemDefinition = require('../models/ItemDefinition');
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');

/**
 * InventoryService — MỘT CỬA duy nhất cho túi đồ. Mọi nơi (shop, reward, quest,
 * luyện tập tiêu hint, cosmetic) chỉ gọi qua đây, không đụng thẳng collection.
 * Server-authoritative: client không tự ghi số lượng.
 */

const slotOf = (def) => def?.effect?.slot || String(def?.type || '').replace('cosmetic_', '');
const isCosmetic = (def) => String(def?.type || '').startsWith('cosmetic_');

/** Túi đồ của user, đã gộp definition (bỏ đồ số lượng 0). */
async function getInventory(userId) {
    const items = await InventoryItem.find({ userId, quantity: { $gt: 0 } }).lean();
    if (items.length === 0) return [];
    const defs = await ItemDefinition.find({ itemId: { $in: items.map(i => i.itemId) } }).lean();
    const defMap = new Map(defs.map(d => [d.itemId, d]));
    return items.map(i => ({ ...i, definition: defMap.get(i.itemId) || null }));
}

/** Thêm đồ (stackable → cộng dồn quantity; unique → đảm bảo tồn tại qty 1). */
async function grant(userId, itemId, quantity = 1, opts = {}) {
    const def = await ItemDefinition.findOne({ itemId }).lean();
    if (!def) throw new Error(`Unknown item: ${itemId}`);

    // Vật phẩm "tài nguyên" (hint/shield/time-freeze) lưu ở counter UserStats,
    // KHÔNG phải inventory_items → định tuyến về đúng field. Nhờ vậy mọi kênh
    // (shop/quest/spin/gift) cấp bằng itemId đều cộng đúng, không tạo row rác.
    if (def.effect?.type === 'resource' && def.effect.field) {
        await UserStats.updateOne({ userId }, { $inc: { [def.effect.field]: quantity } });
        return { resource: def.effect.field, quantity };
    }

    const set = {};
    if (opts.source) set.source = opts.source;
    if (opts.expiresAt !== undefined) set.expiresAt = opts.expiresAt;

    if (def.stackable) {
        return InventoryItem.findOneAndUpdate(
            { userId, itemId },
            { $inc: { quantity }, $setOnInsert: { acquiredAt: new Date() }, $set: set },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
    }
    // Non-stackable: chỉ đảm bảo có 1 (không cộng dồn).
    return InventoryItem.findOneAndUpdate(
        { userId, itemId },
        { $setOnInsert: { quantity: 1, acquiredAt: new Date() }, $set: set },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );
}

/** Có đủ số lượng không. */
async function has(userId, itemId, qty = 1) {
    const it = await InventoryItem.findOne({ userId, itemId }).select('quantity').lean();
    return !!it && it.quantity >= qty;
}

/** Số lượng đang có của 1 item (0 nếu không có). */
async function count(userId, itemId) {
    const it = await InventoryItem.findOne({ userId, itemId }).select('quantity').lean();
    return it?.quantity || 0;
}

/** Trừ đồ ATOMIC: chỉ trừ khi đủ (điều kiện quantity >= qty trong query). */
async function consume(userId, itemId, qty = 1) {
    const res = await InventoryItem.findOneAndUpdate(
        { userId, itemId, quantity: { $gte: qty } },
        { $inc: { quantity: -qty } },
        { new: true },
    );
    return !!res; // null = không đủ
}

/** Trang bị cosmetic: 1 slot 1 item. Ghi UserProfile.equipped[slot] = itemId. */
async function equip(userId, itemId) {
    const def = await ItemDefinition.findOne({ itemId }).lean();
    if (!def) throw new Error(`Unknown item: ${itemId}`);
    if (!isCosmetic(def)) throw new Error('Item không phải cosmetic');

    const owned = await InventoryItem.findOne({ userId, itemId }).lean();
    if (!owned) throw new Error('Chưa sở hữu item này');

    const slot = slotOf(def);
    // Bỏ trang bị các cosmetic cùng slot khác.
    const sameSlotDefs = await ItemDefinition.find({ type: def.type }).select('itemId').lean();
    const sameSlotIds = sameSlotDefs.map(d => d.itemId);
    await InventoryItem.updateMany(
        { userId, itemId: { $in: sameSlotIds }, equipped: true },
        { $set: { equipped: false } },
    );
    await InventoryItem.updateOne({ userId, itemId }, { $set: { equipped: true } });
    await UserProfile.updateOne({ userId }, { $set: { [`equipped.${slot}`]: itemId } });
    return { slot, itemId };
}

/** Bỏ trang bị theo slot. */
async function unequip(userId, slot) {
    const defs = await ItemDefinition.find({ type: `cosmetic_${slot}` }).select('itemId').lean();
    const ids = defs.map(d => d.itemId);
    await InventoryItem.updateMany({ userId, itemId: { $in: ids }, equipped: true }, { $set: { equipped: false } });
    await UserProfile.updateOne({ userId }, { $unset: { [`equipped.${slot}`]: '' } });
    return { slot };
}

/** Slot trang bị hiện tại của user (đọc từ UserProfile). */
async function getEquipped(userId) {
    const p = await UserProfile.findOne({ userId }).select('equipped').lean();
    return p?.equipped || {};
}

module.exports = {
    getInventory,
    grant,
    has,
    count,
    consume,
    equip,
    unequip,
    getEquipped,
};
