/**
 * Seed catalog item_definitions (idempotent — upsert theo itemId).
 * Chạy: node scripts/seedItemDefinitions.js
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const ItemDefinition = require('../models/ItemDefinition');

const ITEMS = [
    // ===== Tiêu hao =====
    { itemId: 'hint', category: 'consumable', name: 'Gợi ý', description: 'Dùng khi luyện tập để loại đáp án sai', icon: 'fa-lightbulb', type: 'consumable', rarity: 'common', stackable: true, effect: { type: 'resource', field: 'hints' }, order: 1 },
    { itemId: 'shield', category: 'consumable', name: 'Khiên bảo vệ streak', description: 'Giữ streak khi bạn nghỉ 1 ngày', icon: 'fa-shield-halved', type: 'consumable', rarity: 'rare', stackable: true, effect: { type: 'resource', field: 'shields' }, order: 2 },
    { itemId: 'time-freeze', category: 'consumable', name: 'Dừng thời gian', description: 'Tạm dừng đồng hồ khi luyện tập', icon: 'fa-pause', type: 'consumable', rarity: 'rare', stackable: true, effect: { type: 'resource', field: 'timeFreezes' }, order: 3 },
    { itemId: 'spin-ticket', category: 'ticket', name: 'Vé quay may mắn', description: 'Dùng để quay Vòng quay may mắn (không tốn lượt/xu)', icon: 'fa-ticket', type: 'consumable', rarity: 'epic', stackable: true, effect: { type: 'spin' }, order: 4 },
    // Nạp đầy bình: bán ngay trong popup "Hết năng lượng" để không phải rời bài
    // thi. effect.type = 'energy_full' → server set energy = maxEnergy.
    { itemId: 'energy-refill-full', category: 'energy', name: 'Nạp đầy năng lượng', description: 'Hồi ⚡ lên mức tối đa ngay lập tức', icon: 'fa-bolt', type: 'consumable', rarity: 'rare', stackable: false, effect: { type: 'energy_full' }, order: 5 },

    // ===== Boost (thẻ kích hoạt — on_use, 2 ngày) =====
    { itemId: 'boost-xp-card', category: 'boost', name: 'Thẻ x2 XP', description: 'Kích hoạt để nhân đôi XP trong 24 giờ', icon: 'fa-bolt', type: 'boost', rarity: 'epic', stackable: true, durationType: 'on_use', durationSec: 86400, effect: { type: 'boost', boostType: 'xp', multiplier: 2, duration: 86400 }, order: 10 },
    { itemId: 'boost-coins-card', category: 'boost', name: 'Thẻ x2 Coins', description: 'Kích hoạt để nhân đôi Coins trong 24 giờ', icon: 'fa-coins', type: 'boost', rarity: 'epic', stackable: true, durationType: 'on_use', durationSec: 86400, effect: { type: 'boost', boostType: 'coins', multiplier: 2, duration: 86400 }, order: 11 },
    { itemId: 'boost-xp3-card', category: 'boost', name: 'Thẻ x3 XP', description: 'Kích hoạt để nhân ba XP trong 24 giờ', icon: 'fa-rocket', type: 'boost', rarity: 'legendary', stackable: true, durationType: 'on_use', durationSec: 86400, effect: { type: 'boost', boostType: 'xp', multiplier: 3, duration: 86400 }, order: 12 },
    // Thẻ tăng TỐC ĐỘ hồi ⚡ — không cộng thẳng ⚡ nên trần maxEnergy vẫn chặn,
    // giá trị nằm ở chỗ rút ngắn thời gian chờ giữa các lượt.
    { itemId: 'boost-energy-x2-card', category: 'boost', name: 'Thẻ hồi ⚡ x2', description: 'Hồi năng lượng nhanh gấp đôi trong 24 giờ', icon: 'fa-battery-half', type: 'boost', rarity: 'rare', stackable: true, durationType: 'on_use', durationSec: 86400, effect: { type: 'boost', boostType: 'energy', multiplier: 2, duration: 86400 }, order: 13 },
    { itemId: 'boost-energy-x3-card', category: 'boost', name: 'Thẻ hồi ⚡ x3', description: 'Hồi năng lượng nhanh gấp ba trong 24 giờ', icon: 'fa-battery-full', type: 'boost', rarity: 'epic', stackable: true, durationType: 'on_use', durationSec: 86400, effect: { type: 'boost', boostType: 'energy', multiplier: 3, duration: 86400 }, order: 14 },
    // Thẻ hồi đầy — bản CẦM TRONG KHO của gói nạp đầy, dùng lúc nào cũng được
    // (và làm được phần thưởng nhiệm vụ/thành tích, khác với gói mua ngay).
    { itemId: 'energy-full-card', category: 'consumable', name: 'Thẻ hồi đầy ⚡', description: 'Dùng để hồi năng lượng lên mức tối đa ngay lập tức', icon: 'fa-bolt', type: 'consumable', rarity: 'rare', stackable: true, durationType: 'on_use', effect: { type: 'energy_full' }, order: 6 },

    // ===== Cosmetic — nền =====
    { itemId: 'bg-vip-week', category: 'background', name: 'Nền Hoàng gia VIP', description: 'Nền hồ sơ & bảng xếp hạng dành cho VIP', icon: 'fa-crown', type: 'cosmetic_background', rarity: 'legendary', stackable: false, durationType: 'from_grant', durationSec: 604800, effect: { slot: 'background', key: 'vip-royal' }, order: 1 },
    { itemId: 'bg-ocean', category: 'background', name: 'Nền Đại dương', description: 'Nền hồ sơ tông xanh đại dương', icon: 'fa-water', type: 'cosmetic_background', rarity: 'rare', stackable: false, durationType: 'permanent', effect: { slot: 'background', key: 'bg-ocean' }, order: 2 },
    { itemId: 'bg-neon', category: 'background', name: 'Nền Neon', description: 'Nền hồ sơ tông neon rực rỡ', icon: 'fa-bolt', type: 'cosmetic_background', rarity: 'epic', stackable: false, durationType: 'permanent', effect: { slot: 'background', key: 'bg-neon' }, order: 3 },

    // ===== Cosmetic — khung avatar =====
    { itemId: 'frame-gold', category: 'frame', name: 'Khung Vàng', description: 'Khung avatar viền vàng sang trọng', icon: 'fa-crown', type: 'cosmetic_frame', rarity: 'epic', stackable: false, durationType: 'permanent', effect: { slot: 'frame', key: 'frame-gold' }, order: 10 },
    { itemId: 'frame-neon', category: 'frame', name: 'Khung Neon', description: 'Khung avatar phát sáng neon', icon: 'fa-circle-notch', type: 'cosmetic_frame', rarity: 'rare', stackable: false, durationType: 'permanent', effect: { slot: 'frame', key: 'frame-neon' }, order: 11 },

    // ===== Cosmetic — avatar (ảnh /uploads/avatar/<key>.png — admin sửa được) =====
    { itemId: 'avatar-cat', category: 'avatar', name: 'Avatar Mèo phi hành gia', description: 'Ảnh đại diện mèo phi hành gia', icon: 'fa-user-astronaut', image: '/uploads/avatar/avt-cat-990.png', type: 'cosmetic_avatar', rarity: 'epic', stackable: false, durationType: 'permanent', effect: { slot: 'avatar', key: 'avatar-cat' }, order: 20 },
    { itemId: 'avatar-fox', category: 'avatar', name: 'Avatar Cáo', description: 'Ảnh đại diện cáo', icon: 'fa-paw', image: '/uploads/avatar/avt-fox-990.png', type: 'cosmetic_avatar', rarity: 'rare', stackable: false, durationType: 'permanent', effect: { slot: 'avatar', key: 'avatar-fox' }, order: 21 },
    { itemId: 'avatar-robot', category: 'avatar', name: 'Avatar Robot', description: 'Ảnh đại diện robot', icon: 'fa-robot', image: '/uploads/avatar/avt-robot-990.png', type: 'cosmetic_avatar', rarity: 'rare', stackable: false, durationType: 'permanent', effect: { slot: 'avatar', key: 'avatar-robot' }, order: 22 },
];

// Giá mặc định (cửa hàng lấy từ đây). Chỉ set khi item chưa có giá (không đè admin đã chỉnh).
const PRICES = {
    'hint':             { price: 200,  currency: 'coins' },
    'shield':           { price: 500,  currency: 'coins' },
    'time-freeze':      { price: 300,  currency: 'coins' },
    'spin-ticket':      { price: 1000, currency: 'coins' },
    'energy-refill-full':    { price: 200, currency: 'coins' },
    'boost-energy-x2-card':  { price: 150, currency: 'coins' },
    'boost-energy-x3-card':  { price: 400, currency: 'coins' },
    'energy-full-card':      { price: 250, currency: 'coins' },
    'boost-xp-card':    { price: 2000, currency: 'coins' },
    'boost-coins-card': { price: 2000, currency: 'coins' },
    'boost-xp3-card':   { price: 3000, currency: 'coins' },
    'bg-vip-week':      { price: 50,   currency: 'gems' },
    'bg-ocean':         { price: 800,  currency: 'coins' },
    'bg-neon':          { price: 30,   currency: 'gems' },
    'frame-gold':       { price: 40,   currency: 'gems' },
    'frame-neon':       { price: 500,  currency: 'coins' },
    'avatar-cat':       { price: 40,   currency: 'gems' },
    'avatar-fox':       { price: 600,  currency: 'coins' },
    'avatar-robot':     { price: 600,  currency: 'coins' },
};

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    let ok = 0;
    for (const it of ITEMS) {
        await ItemDefinition.updateOne({ itemId: it.itemId }, { $set: it }, { upsert: true });
        ok++;
    }
    // Backfill giá cho item chưa có giá (price chưa tồn tại hoặc = 0).
    let priced = 0;
    for (const [itemId, p] of Object.entries(PRICES)) {
        const r = await ItemDefinition.updateOne(
            { itemId, $or: [{ price: { $exists: false } }, { price: 0 }] },
            { $set: { price: p.price, currency: p.currency } }
        );
        if (r.modifiedCount) priced++;
    }
    if (priced) console.log(`Backfill giá cho ${priced} item.`);
    // Backfill: item cũ chưa có field published → coi như đã xuất bản.
    const bf = await ItemDefinition.updateMany({ published: { $exists: false } }, { $set: { published: true } });
    if (bf.modifiedCount) console.log(`Backfill published=true cho ${bf.modifiedCount} item.`);
    console.log(`Seeded ${ok} item definitions.`);
    const total = await ItemDefinition.countDocuments();
    console.log(`Tong item_definitions: ${total}`);
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
