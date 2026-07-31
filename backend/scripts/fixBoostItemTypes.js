/**
 * Vá dữ liệu catalog bị hai lỗi cũ làm hỏng:
 *
 *  1. deriveType() từng ép mọi category không phải cosmetic về type='item', nên
 *     thẻ boost / vật phẩm tiêu hao nào từng được sửa trong admin đều rơi khỏi
 *     tab tương ứng của túi đồ (túi đồ lọc theo `type`).
 *  2. Select boostType trong admin thiếu option 'energy', gán vào option không
 *     tồn tại nên lưu boostType='' → applyShopEffect không khớp nhánh nào →
 *     thẻ bị tiêu mà không bật gì.
 *
 * Script idempotent, chỉ ghi khi thực sự lệch. Chạy: node scripts/fixBoostItemTypes.js
 * Thêm --dry để chỉ xem, không ghi.
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const ItemDefinition = require('../models/ItemDefinition');

const DRY = process.argv.includes('--dry');

// Dùng đúng quy tắc mà route admin dùng — script vá và route ghi phải cùng một
// định nghĩa, nếu không lần sửa sau trong admin lại làm hỏng lại.
const { deriveType, BOOST_TYPES } = require('../utils/itemDefRules');

// boostType chỉ suy được từ itemId khi tên đã nói rõ nó boost cái gì — đoán bừa
// còn tệ hơn để nguyên cho admin tự sửa.
function guessBoostType(itemId) {
    if (/energy/i.test(itemId)) return 'energy';
    if (/xp/i.test(itemId)) return 'xp';
    if (/coin/i.test(itemId)) return 'coins';
    return null;
}

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const items = await ItemDefinition.find({}).lean();
    let fixedType = 0, fixedBoost = 0, skipped = 0;

    for (const it of items) {
        const set = {};

        const want = deriveType(it.category, it.type);
        if (it.type !== want) set.type = want;

        if (it.effect?.type === 'boost' && !BOOST_TYPES.includes(it.effect.boostType)) {
            const guess = guessBoostType(it.itemId);
            if (guess) set.effect = { ...it.effect, boostType: guess };
            else {
                console.log(`  ⚠ ${it.itemId}: boostType="${it.effect.boostType ?? ''}" — không suy được từ itemId, sửa tay trong admin`);
                skipped++;
            }
        }

        if (!Object.keys(set).length) continue;
        if (set.type) fixedType++;
        if (set.effect) fixedBoost++;
        console.log(`${DRY ? '[dry] ' : ''}${it.itemId}: ${JSON.stringify(set)}  (cũ: type=${it.type}, boostType=${it.effect?.boostType})`);
        if (!DRY) await ItemDefinition.updateOne({ _id: it._id }, { $set: set });
    }

    console.log(`\nXong: sửa type ${fixedType} item, sửa boostType ${fixedBoost} item, bỏ qua ${skipped}.`);
    await mongoose.disconnect();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
