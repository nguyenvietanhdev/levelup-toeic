/**
 * Seed cấu hình danh mục mặc định cho từng kênh (idempotent — chỉ tạo nếu chưa có,
 * KHÔNG ghi đè lựa chọn admin đã chỉnh).
 *   node scripts/seedChannelConfigs.js
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const ChannelConfig = require('../models/ChannelConfig');

// Mặc định hợp lý: kênh nào tick sẵn danh mục nào.
const DEFAULTS = {
    shop:        ['consumable', 'boost', 'avatar', 'background', 'frame', 'ticket'],
    spin:        ['consumable', 'boost', 'avatar', 'background', 'frame'],
    quest:       ['consumable', 'boost'],
    achievement: ['consumable', 'boost', 'avatar', 'frame'],
};

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    let created = 0;
    for (const [channel, categories] of Object.entries(DEFAULTS)) {
        const existing = await ChannelConfig.findOne({ channel });
        if (!existing) {
            await ChannelConfig.create({ channel, categories });
            created++;
        }
    }
    console.log(`Seeded ${created} channel configs (tổng: ${await ChannelConfig.countDocuments()}).`);
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
