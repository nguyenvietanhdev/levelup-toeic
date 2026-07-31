const mongoose = require('mongoose');

/**
 * InventoryItem — SỞ HỮU: "ai CÓ gì". Collection riêng (scale-ready: sau này
 * shard theo userId hoặc tách service đều dễ). Stackable → 1 dòng/loại (quantity);
 * unique/cosmetic → quantity 1.
 */
const inventoryItemSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        itemId: { type: String, required: true, trim: true },

        quantity: { type: Number, default: 1, min: 0 },
        acquiredAt: { type: Date, default: Date.now },
        source: { type: String, default: 'system' }, // shop | reward | vip | quest | admin | system

        // Đồ có hạn (VIP background, boost…); null = vĩnh viễn / chưa kích hoạt. TTL tự dọn.
        expiresAt: { type: Date, default: null },
        // on_use: mốc kích hoạt (null = chưa dùng). Khi kích hoạt → set expiresAt.
        activatedAt: { type: Date, default: null },

        // Cosmetic đang trang bị (nguồn chân lý cho slot ở UserProfile.equipped).
        equipped: { type: Boolean, default: false },

        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true, collection: 'inventory_items' }
);

// 1 dòng/loại/người (đồ stackable cộng dồn quantity).
inventoryItemSchema.index({ userId: 1, itemId: 1 }, { unique: true });
// Lọc túi đồ theo người.
inventoryItemSchema.index({ userId: 1 });
// TTL: doc có expiresAt < now tự xoá; expiresAt=null không bị xoá.
inventoryItemSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
