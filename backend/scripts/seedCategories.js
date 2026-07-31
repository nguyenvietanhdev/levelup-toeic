/**
 * Seed danh mục mặc định (idempotent — upsert theo domain+key).
 * Giữ khớp với enum/tab cũ để không vỡ dữ liệu hiện có.
 *   node scripts/seedCategories.js
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const Category = require('../models/Category');

const CATS = [
    // ── VẬT PHẨM (domain 'item') — bộ danh mục gốc: item gán vào, các kênh lọc theo ──
    { domain: 'item', key: 'consumable', label: 'Tiêu hao',   icon: '🧪', order: 10 },
    { domain: 'item', key: 'boost',      label: 'Tăng tốc',   icon: '🚀', order: 20 },
    { domain: 'item', key: 'avatar',     label: 'Avatar',     icon: '🙂', order: 30 },
    { domain: 'item', key: 'background', label: 'Nền',        icon: '🖼️', order: 40 },
    { domain: 'item', key: 'frame',      label: 'Khung',      icon: '🔲', order: 50 },
    { domain: 'item', key: 'ticket',     label: 'Vé & Quay',  icon: '🎟️', order: 60 },
    // Danh mục sản phẩm cửa hàng (gói/dịch vụ) — sau khi gộp ShopItem vào catalog.
    { domain: 'item', key: 'energy',     label: 'Năng lượng', icon: '⚡', order: 70 },
    { domain: 'item', key: 'resource',   label: 'Gói tài nguyên', icon: '🎒', order: 80 },
    { domain: 'item', key: 'exchange',   label: 'Quy đổi',    icon: '💱', order: 90 },
    { domain: 'item', key: 'cosmetic',   label: 'Giao diện',  icon: '🎨', order: 100 },
    { domain: 'item', key: 'bundle',     label: 'Combo',      icon: '🎁', order: 110 },
    { domain: 'item', key: 'vip',        label: 'VIP',        icon: '👑', order: 120 },

    // ── Cửa hàng ──
    { domain: 'shop', key: 'energy',   label: 'Năng lượng', icon: '⚡', order: 10 },
    { domain: 'shop', key: 'resource', label: 'Tài nguyên', icon: '🎒', order: 20 },
    { domain: 'shop', key: 'boost',    label: 'Tăng tốc',   icon: '🚀', order: 30 },
    { domain: 'shop', key: 'exchange', label: 'Quy đổi',    icon: '💱', order: 40 },
    { domain: 'shop', key: 'cosmetic', label: 'Giao diện',  icon: '🎨', order: 50 },
    { domain: 'shop', key: 'bundle',   label: 'Combo',      icon: '🎁', order: 60 },
    { domain: 'shop', key: 'vip',      label: 'VIP',        icon: '👑', order: 70 },

    // ── Thành tích ──
    { domain: 'achievement', key: 'learning', label: 'Học tập',   icon: '📖', order: 10 },
    { domain: 'achievement', key: 'practice', label: 'Luyện tập', icon: '🎮', order: 20 },
    { domain: 'achievement', key: 'speed',    label: 'Tốc độ',    icon: '⚡', order: 30 },
    { domain: 'achievement', key: 'skill',    label: 'Kỹ năng',   icon: '🎯', order: 40 },
    { domain: 'achievement', key: 'streak',   label: 'Chuỗi ngày',icon: '🔥', order: 50 },
    { domain: 'achievement', key: 'social',   label: 'Xã hội',    icon: '👥', order: 60 },

    // ── Nhiệm vụ (chu kỳ) ──
    { domain: 'quest', key: 'daily',   label: 'Hằng ngày', icon: '📅', order: 10 },
    { domain: 'quest', key: 'weekly',  label: 'Hằng tuần', icon: '🗓️', order: 20 },
    { domain: 'quest', key: 'monthly', label: 'Hằng tháng',icon: '📆', order: 30 },
    { domain: 'quest', key: 'special', label: 'Đặc biệt',  icon: '⭐', order: 40 },
];

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    let ok = 0;
    for (const c of CATS) {
        await Category.updateOne({ domain: c.domain, key: c.key }, { $set: c }, { upsert: true });
        ok++;
    }
    console.log(`Seeded ${ok} categories (tổng: ${await Category.countDocuments()}).`);
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
