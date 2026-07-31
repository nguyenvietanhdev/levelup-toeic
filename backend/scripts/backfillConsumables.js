/**
 * Backfill Phase 1 — mirror consumables (hints/shields/timeFreezes) từ UserStats
 * sang inventory_items. Idempotent (SET quantity = số hiện tại). CHƯA đổi
 * read/write: đây chỉ là bản sao nền móng; việc chuyển consumption path sang
 * InventoryService làm ở bước sau.
 * Chạy: node scripts/backfillConsumables.js
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const UserStats = require('../models/UserStats');
const InventoryItem = require('../models/InventoryItem');

const MAP = [
    { itemId: 'hint', field: 'hints' },
    { itemId: 'shield', field: 'shields' },
    { itemId: 'time-freeze', field: 'timeFreezes' },
];

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const cursor = UserStats.find({}, { userId: 1, hints: 1, shields: 1, timeFreezes: 1 }).lean().cursor();
    let users = 0, rows = 0;
    for (let s = await cursor.next(); s != null; s = await cursor.next()) {
        users++;
        for (const { itemId, field } of MAP) {
            const qty = s[field] || 0;
            if (qty <= 0) continue;
            await InventoryItem.updateOne(
                { userId: s.userId, itemId },
                { $set: { quantity: qty, source: 'backfill' }, $setOnInsert: { acquiredAt: new Date() } },
                { upsert: true },
            );
            rows++;
        }
    }
    console.log(`Backfill xong: duyet ${users} user, ghi ${rows} inventory rows.`);
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
