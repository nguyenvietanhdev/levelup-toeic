/**
 * Gộp shop_items vào catalog item_definitions (idempotent).
 * Mỗi ShopItem → 1 ItemDefinition (published, giá, danh mục = category shop [nay là
 * danh mục item], effect giữ nguyên → engine mua áp y hệt).
 *
 * XỬ LÝ BẪY:
 *  - 'boost-xp3-card': ShopItem trùng itemId với catalog ATOMIC (effect tự trỏ chính
 *    nó → grant vòng lặp). BỎ QUA — bán thẳng thẻ atomic (đã có giá).
 *  - Thẻ boost VIP-only 'boost-xp-card'/'boost-coins-card': KHÔNG bày bán → published=false
 *    (grant khi mua VIP không bị chặn vì grant không kiểm published).
 *  - Cấu hình kênh 'shop' → set danh mục = danh mục sản phẩm shop.
 *
 *   node scripts/mergeShopToCatalog.js
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const ShopItem = require('../models/ShopItem');
const ItemDefinition = require('../models/ItemDefinition');
const ChannelConfig = require('../models/ChannelConfig');

const SKIP_IDS = new Set(['boost-xp3-card']); // trùng atomic self-grant → bán atomic
const UNPUBLISH_ATOMIC = ['boost-xp-card', 'boost-coins-card']; // thẻ VIP-only, không bày bán
const SHOP_CATEGORIES = ['energy', 'resource', 'boost', 'exchange', 'cosmetic', 'bundle', 'vip'];

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const shopItems = await ShopItem.find().lean();
    let merged = 0, skipped = 0;

    for (const s of shopItems) {
        if (SKIP_IDS.has(s.itemId)) { skipped++; continue; }
        await ItemDefinition.updateOne(
            { itemId: s.itemId },
            {
                $set: {
                    itemId: s.itemId,
                    name: s.name,
                    description: s.description || '',
                    icon: s.icon || '',
                    image: s.image || '',
                    category: s.category,          // energy/resource/boost/exchange/cosmetic/bundle/vip
                    price: s.price,
                    currency: s.currency,
                    discountPercent: s.discountPercent || 0,
                    cooldownDays: s.cooldownDays || 0,
                    effect: s.effect || {},
                    type: 'service',               // nhãn (định tuyến dựa vào effect)
                    published: true,
                    isActive: s.isActive !== false,
                    order: (s.order || 0) + 1000,  // xếp sau các item atomic
                },
            },
            { upsert: true }
        );
        merged++;
    }

    // Thẻ boost VIP-only: ẩn khỏi cửa hàng (vẫn grant được khi mua VIP).
    const r = await ItemDefinition.updateMany(
        { itemId: { $in: UNPUBLISH_ATOMIC } },
        { $set: { published: false } }
    );

    // Cấu hình kênh cửa hàng: hiển thị các danh mục sản phẩm shop.
    await ChannelConfig.updateOne(
        { channel: 'shop' },
        { $set: { categories: SHOP_CATEGORIES } },
        { upsert: true }
    );

    console.log(`Gộp ${merged} sản phẩm shop vào catalog (bỏ qua ${skipped} trùng atomic).`);
    console.log(`Ẩn ${r.modifiedCount} thẻ VIP-only khỏi cửa hàng.`);
    console.log(`Cấu hình kênh 'shop' → [${SHOP_CATEGORIES.join(', ')}].`);
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
