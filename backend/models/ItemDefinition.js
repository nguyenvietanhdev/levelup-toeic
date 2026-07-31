const mongoose = require('mongoose');

/**
 * ItemDefinition — CATALOG: một item "LÀ GÌ" (bất biến, admin định nghĩa).
 * Tách khỏi sở hữu (InventoryItem = "ai CÓ gì"). Không chứa số lượng.
 */
const itemDefinitionSchema = new mongoose.Schema(
    {
        itemId: { type: String, required: true, unique: true, trim: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        icon: { type: String, default: '' },
        // Ảnh vật phẩm — ưu tiên hơn icon khi hiển thị (túi đồ, vòng quay…).
        image: { type: String, default: '' },

        // Danh mục (Category.key domain 'item') — GỐC phân loại: các kênh
        // (cửa hàng / vòng quay / nhiệm vụ / thành tích) lọc/hiển thị theo đây.
        category: { type: String, default: '', trim: true },

        // Giá & giảm giá — NGUỒN DUY NHẤT. Cửa hàng lấy thẳng giá này (không tự đặt);
        // vòng quay tính kiểu riêng (trọng số), không dùng giá. price=0 ⇒ không bán.
        // Giá theo GÓI: price = giá gốc 1 đơn vị, quantity = số đơn vị trong gói.
        // Tổng giá = quantity × price × (1 − discountPercent/100). Mua 1 gói → nhận
        // quantity đơn vị (nhân cả hiệu ứng lẫn vật phẩm con).
        price: { type: Number, default: 0 },
        quantity: { type: Number, default: 1, min: 1 },
        currency: { type: String, enum: ['coins', 'gems'], default: 'coins' },
        discountPercent: { type: Number, default: 0, min: 0, max: 100 }, // % giảm (0 = không giảm)
        // Hết hạn khuyến mãi/listing: tới hạn thì tự áp `afterExpiry` (đánh giá lười khi đọc/mua).
        saleEndsAt: { type: Date, default: null },
        afterExpiry: { type: String, enum: ['unpublish', 'revert'], default: 'unpublish' },
        // Giới hạn mua theo chu kỳ (ngày). 0 = không giới hạn. (vd Gói Khiên: 7)
        cooldownDays: { type: Number, default: 0 },
        // Vật phẩm con (combo) — mua grant tất cả con × quantity. Grant qua Inventory.
        children: {
            type: [new mongoose.Schema(
                { itemId: { type: String, required: true, trim: true }, quantity: { type: Number, default: 1, min: 1 } },
                { _id: false }
            )],
            default: [],
        },

        // Nhãn kỹ thuật — KHÔNG nhập tay nữa; tự suy từ category (cosmetic_* cho
        // avatar/background/frame để giữ logic trang bị theo slot). Mặc định 'item'.
        type: { type: String, default: 'item', trim: true },
        rarity: {
            type: String,
            enum: ['common', 'rare', 'epic', 'legendary'],
            default: 'common',
        },

        stackable: { type: Boolean, default: true },
        maxStack: { type: Number, default: null },

        // Cơ chế hạn dùng:
        //  - 'permanent'  : không hết hạn (cosmetic mua đứt)
        //  - 'from_grant' : đếm từ lúc NHẬN (dùng hay không cũng hết) — vd nền VIP
        //  - 'on_use'     : nằm túi vô hạn; KÍCH HOẠT mới bắt đầu đếm — vd thẻ x2 XP
        durationType: {
            type: String,
            enum: ['permanent', 'from_grant', 'on_use'],
            default: 'permanent',
        },
        durationSec: { type: Number, default: 0 }, // dùng cho from_grant / on_use

        // Ngữ nghĩa hiệu ứng (vd { slot:'background', key:'vip-royal' }
        // hoặc { boostType:'xp', multiplier:2, duration:604800 }).
        effect: { type: mongoose.Schema.Types.Mixed, default: {} },

        tradable: { type: Boolean, default: false }, // dự phòng tương lai
        // Xuất bản: chỉ item published=true mới được các kênh (cửa hàng/vòng quay/
        // nhiệm vụ/thành tích) hiển thị ra giao diện. isActive vẫn là công tắc "sống/chết".
        published: { type: Boolean, default: true },
        isActive: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true, collection: 'item_definitions' }
);

itemDefinitionSchema.index({ isActive: 1, type: 1, order: 1 });

module.exports = mongoose.model('ItemDefinition', itemDefinitionSchema);
