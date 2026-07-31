/**
 * Seed shop_items collection.
 * Safe to run multiple times — uses upsert by itemId.
 * Usage: node scripts/admin/seed-shop-items.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ShopItem = require('../../models/ShopItem');

const ITEMS = [
    // ===== NĂNG LƯỢNG =====
    {
        itemId: 'energy-refill',
        name: 'Nạp Năng Lượng',
        description: 'Khôi phục 100% năng lượng ngay lập tức',
        icon: '⚡',
        category: 'energy',
        price: 150,
        currency: 'coins',
        effect: { type: 'energy', amount: 100 },
        isActive: true,
        order: 10,
    },

    // ===== TÀI NGUYÊN =====
    {
        itemId: 'hints-pack',
        name: 'Gói Gợi Ý',
        description: 'Nhận 10 lượt sử dụng gợi ý',
        icon: '💡',
        category: 'resource',
        price: 200,
        currency: 'coins',
        effect: { type: 'item', itemId: 'hint', amount: 10 },
        isActive: true,
        order: 20,
    },
    {
        itemId: 'shields-pack',
        name: 'Gói Khiên Bảo Vệ',
        description: 'Nhận 3 khiên bảo vệ streak',
        icon: '🛡️',
        category: 'resource',
        price: 250,
        currency: 'coins',
        effect: { type: 'item', itemId: 'shield', amount: 3 },
        isActive: true,
        order: 21,
    },
    {
        itemId: 'time-freeze-pack',
        name: 'Gói Dừng Thời Gian',
        description: 'Nhận 5 lượt dừng thời gian (10s/lượt)',
        icon: '⏸️',
        category: 'resource',
        price: 300,
        currency: 'coins',
        effect: { type: 'item', itemId: 'time-freeze', amount: 5 },
        isActive: true,
        order: 22,
    },

    // ===== TĂNG TỐC =====
    {
        itemId: 'xp-boost-3h',
        name: 'x2 XP (3 giờ)',
        description: 'Nhận gấp đôi XP trong 3 giờ',
        icon: '🚀',
        category: 'boost',
        price: 350,
        currency: 'coins',
        effect: { type: 'boost', boostType: 'xp', multiplier: 2, duration: 10800 },
        isActive: true,
        order: 30,
    },
    {
        itemId: 'xp-boost-24h',
        name: 'x2 XP (24 giờ)',
        description: 'Nhận gấp đôi XP cả ngày',
        icon: '🚀',
        category: 'boost',
        price: 100,
        currency: 'gems',
        effect: { type: 'boost', boostType: 'xp', multiplier: 2, duration: 86400 },
        isActive: true,
        order: 31,
    },
    {
        itemId: 'coins-boost-3h',
        name: 'x2 Coins (3 giờ)',
        description: 'Nhận gấp đôi coins trong 3 giờ',
        icon: '💰',
        category: 'boost',
        price: 300,
        currency: 'coins',
        effect: { type: 'boost', boostType: 'coins', multiplier: 2, duration: 10800 },
        isActive: true,
        order: 32,
    },
    {
        itemId: 'coins-boost-24h',
        name: 'x2 Coins (24 giờ)',
        description: 'Nhận gấp đôi coins cả ngày',
        icon: '💰',
        category: 'boost',
        price: 80,
        currency: 'gems',
        effect: { type: 'boost', boostType: 'coins', multiplier: 2, duration: 86400 },
        isActive: true,
        order: 33,
    },

    // ===== ĐỔI GEMS =====
    {
        itemId: 'gems-exchange-small',
        name: 'Đổi 10 Gems',
        description: '1000 coins → 10 gems',
        icon: '💎',
        category: 'exchange',
        price: 1000,
        currency: 'coins',
        effect: { type: 'gems', amount: 10 },
        isActive: true,
        order: 40,
    },
    {
        itemId: 'gems-exchange-medium',
        name: 'Đổi 30 Gems',
        description: '2800 coins → 30 gems (Giảm 7%)',
        icon: '💎',
        category: 'exchange',
        price: 2800,
        currency: 'coins',
        effect: { type: 'gems', amount: 30 },
        isActive: true,
        order: 41,
    },
    {
        itemId: 'gems-exchange-large',
        name: 'Đổi 100 Gems',
        description: '9000 coins → 100 gems (Giảm 10%)',
        icon: '💎',
        category: 'exchange',
        price: 9000,
        currency: 'coins',
        effect: { type: 'gems', amount: 100 },
        isActive: true,
        order: 42,
    },

    // Đổi ngược: Gems → Xu
    {
        itemId: 'coins-exchange-small',
        name: 'Đổi 800 Xu',
        description: '8 gems → 800 xu',
        icon: '🪙',
        category: 'exchange',
        price: 8,
        currency: 'gems',
        effect: { type: 'coins', amount: 800 },
        isActive: true,
        order: 45,
    },
    {
        itemId: 'coins-exchange-large',
        name: 'Đổi 5000 Xu',
        description: '45 gems → 5000 xu (Giảm 10%)',
        icon: '🪙',
        category: 'exchange',
        price: 45,
        currency: 'gems',
        effect: { type: 'coins', amount: 5000 },
        isActive: true,
        order: 46,
    },

    // ===== THẺ TĂNG TỐC (cấp cao) =====
    {
        itemId: 'boost-xp3-card',
        name: 'Thẻ x3 XP (24h)',
        description: 'Kích hoạt trong túi đồ để nhân ba XP cả ngày',
        icon: '🚀',
        category: 'boost',
        price: 220,
        currency: 'gems',
        effect: { type: 'item', itemId: 'boost-xp3-card', amount: 1 },
        isActive: true,
        order: 34,
    },

    // ===== GIAO DIỆN (cosmetic — mua 1 lần, trang bị trong túi đồ) =====
    {
        itemId: 'shop-bg-ocean',
        name: 'Nền Đại dương',
        description: 'Nền hồ sơ tông xanh đại dương (vĩnh viễn)',
        icon: '🌊',
        category: 'cosmetic',
        price: 120,
        currency: 'gems',
        effect: { type: 'item', itemId: 'bg-ocean', amount: 1 },
        isActive: true,
        order: 70,
    },
    {
        itemId: 'shop-bg-neon',
        name: 'Nền Neon',
        description: 'Nền hồ sơ tông neon rực rỡ (vĩnh viễn)',
        icon: '🌈',
        category: 'cosmetic',
        price: 180,
        currency: 'gems',
        effect: { type: 'item', itemId: 'bg-neon', amount: 1 },
        isActive: true,
        order: 71,
    },
    {
        itemId: 'shop-frame-gold',
        name: 'Khung Vàng',
        description: 'Khung avatar viền vàng (vĩnh viễn)',
        icon: '🖼️',
        category: 'cosmetic',
        price: 150,
        currency: 'gems',
        effect: { type: 'item', itemId: 'frame-gold', amount: 1 },
        isActive: true,
        order: 72,
    },
    {
        itemId: 'shop-frame-neon',
        name: 'Khung Neon',
        description: 'Khung avatar phát sáng neon (vĩnh viễn)',
        icon: '🖼️',
        category: 'cosmetic',
        price: 100,
        currency: 'gems',
        effect: { type: 'item', itemId: 'frame-neon', amount: 1 },
        isActive: true,
        order: 73,
    },
    {
        itemId: 'shop-avatar-cat',
        name: 'Avatar Mèo phi hành gia',
        description: 'Ảnh đại diện mèo phi hành gia (vĩnh viễn)',
        image: '/uploads/avatar/avt-cat-990.png',
        icon: '🐱',
        category: 'cosmetic',
        price: 200,
        currency: 'gems',
        effect: { type: 'item', itemId: 'avatar-cat', amount: 1 },
        isActive: true,
        order: 74,
    },
    {
        itemId: 'shop-avatar-fox',
        name: 'Avatar Cáo',
        description: 'Ảnh đại diện cáo (vĩnh viễn)',
        image: '/uploads/avatar/avt-fox-990.png',
        icon: '🦊',
        category: 'cosmetic',
        price: 150,
        currency: 'gems',
        effect: { type: 'item', itemId: 'avatar-fox', amount: 1 },
        isActive: true,
        order: 75,
    },
    {
        itemId: 'shop-avatar-robot',
        name: 'Avatar Robot',
        description: 'Ảnh đại diện robot (vĩnh viễn)',
        image: '/uploads/avatar/avt-robot-990.png',
        icon: '🤖',
        category: 'cosmetic',
        price: 150,
        currency: 'gems',
        effect: { type: 'item', itemId: 'avatar-robot', amount: 1 },
        isActive: true,
        order: 76,
    },

    // ===== GÓI COMBO =====
    {
        itemId: 'daily-pack',
        name: 'Gói Hằng Ngày',
        description: 'x2 XP + x2 Coins trong 24h',
        icon: '⚡',
        category: 'bundle',
        price: 150,
        currency: 'gems',
        effect: { type: 'combo', items: [
            { type: 'boost', boostType: 'xp', multiplier: 2, duration: 86400 },
            { type: 'boost', boostType: 'coins', multiplier: 2, duration: 86400 },
        ]},
        isActive: true,
        order: 50,
    },
    {
        itemId: 'mega-bundle',
        name: 'Gói Siêu Hạng',
        description: '500 coins + 20 hints + 5 shields + x2 XP 24h',
        icon: '🎁',
        category: 'bundle',
        price: 250,
        currency: 'gems',
        effect: { type: 'combo', items: [
            { type: 'coins', amount: 500 },
            { type: 'hints', amount: 20 },
            { type: 'shield', amount: 5 },
            { type: 'boost', boostType: 'xp', multiplier: 2, duration: 86400 },
        ]},
        isActive: true,
        order: 51,
    },

    // ===== VIP =====
    {
        itemId: 'vip-week',
        name: 'VIP Tuần',
        description: 'Unlimited energy + x2 XP/Coins trong 7 ngày',
        icon: '👑',
        category: 'vip',
        price: 300,
        currency: 'gems',
        effect: { type: 'vip', duration: 604800 },
        isActive: true,
        order: 60,
    },
    {
        itemId: 'vip-month',
        name: 'VIP Tháng',
        description: 'Unlimited energy + x2 XP/Coins trong 30 ngày',
        icon: '👑',
        category: 'vip',
        price: 1000,
        currency: 'gems',
        effect: { type: 'vip', duration: 2592000 },
        isActive: true,
        order: 61,
    },
];

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    let created = 0, updated = 0;
    for (const item of ITEMS) {
        const result = await ShopItem.findOneAndUpdate(
            { itemId: item.itemId },
            { $set: item },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        const isNew = result.createdAt?.getTime() === result.updatedAt?.getTime();
        if (isNew) created++; else updated++;
        console.log(`  ✓ ${item.itemId} — ${item.name}`);
    }

    console.log(`\nDone: ${created} created, ${updated} updated`);
    await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
