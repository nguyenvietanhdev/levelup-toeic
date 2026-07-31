const mongoose = require('mongoose');

// Danh mục dùng chung, tách theo domain (shop / achievement / quest). Admin tự
// quản (thêm/sửa/xoá) → không phải sửa enum trong code. Shop/Quest/Achievement
// tham chiếu bằng `key`; frontend dựng tab từ danh sách này.
const categorySchema = new mongoose.Schema(
    {
        // 'item' = bộ danh mục GỐC mà vật phẩm gán vào (các kênh lọc theo đây).
        // Thiếu nó trong enum thì POST /admin/categories tạo danh mục vật phẩm sẽ
        // bị validate chặn, dù dữ liệu domain 'item' đã dùng khắp nơi.
        domain: { type: String, enum: ['item', 'shop', 'quest', 'achievement'], required: true },
        key: { type: String, required: true, trim: true }, // slug, duy nhất trong domain
        label: { type: String, required: true, trim: true },
        icon: { type: String, default: '' }, // FA class ('fa-store') hoặc emoji
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true, collection: 'categories' }
);

categorySchema.index({ domain: 1, key: 1 }, { unique: true });
categorySchema.index({ domain: 1, order: 1 });

module.exports = mongoose.model('Category', categorySchema);
