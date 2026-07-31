const mongoose = require('mongoose');

/**
 * ChannelConfig — mỗi KÊNH (cửa hàng / vòng quay / nhiệm vụ / thành tích) chọn
 * những DANH MỤC vật phẩm (Category.key domain 'item') nào để hiển thị.
 * Giao diện kênh = item published=true & category ∈ categories.
 */
const channelConfigSchema = new mongoose.Schema(
    {
        channel: {
            type: String,
            required: true,
            unique: true,
            enum: ['shop', 'spin', 'quest', 'achievement'],
        },
        categories: { type: [String], default: [] }, // Category.key (domain 'item')
    },
    { timestamps: true, collection: 'channel_configs' }
);

module.exports = mongoose.model('ChannelConfig', channelConfigSchema);
