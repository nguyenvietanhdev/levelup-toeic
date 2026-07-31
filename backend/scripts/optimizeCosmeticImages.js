/**
 * Nén ảnh cosmetic ĐÃ upload từ trước (thời chưa nén lúc upload) → WebP, rồi
 * trỏ lại `ItemDefinition.image` sang file mới.
 *
 * Ảnh gốc KHÔNG bị xoá — sau khi chạy nó thành file mồ côi, dọn bằng công cụ
 * dọn upload sẵn có nếu muốn. Giữ lại để còn đường lùi nếu ảnh nén xấu.
 *
 *   node scripts/optimizeCosmeticImages.js           # xem trước
 *   node scripts/optimizeCosmeticImages.js --apply    # nén + cập nhật DB
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ItemDefinition = require('../models/ItemDefinition');
const { optimizeImageFile, SKIP_UNDER_BYTES } = require('../utils/imageOptimizer');

const APPLY = process.argv.includes('--apply');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const kb = (n) => `${Math.round(n / 1024)}KB`;

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(APPLY ? '=== NÉN & GHI DB ===' : '=== XEM TRƯỚC (chưa đụng gì) ===');

    const docs = await ItemDefinition.find({ image: { $nin: ['', null] } })
        .select('itemId name image').lean();

    let done = 0, saved = 0;
    for (const d of docs) {
        if (!d.image.startsWith('/uploads/')) continue;          // ảnh ngoài (cloud) — bỏ qua
        if (d.image.endsWith('.webp')) continue;                 // đã nén rồi

        const abs = path.join(PUBLIC_DIR, d.image.replace(/^\//, ''));
        if (!abs.startsWith(PUBLIC_DIR) || !fs.existsSync(abs)) {
            console.log(`  ⚠ ${d.itemId}: không thấy file ${d.image}`);
            continue;
        }

        const before = fs.statSync(abs).size;
        if (!APPLY) {
            if (before < SKIP_UNDER_BYTES) {
                console.log(`  ${d.itemId} (${d.name}) — ${kb(before)} · bỏ qua, đã đủ nhẹ`);
            } else {
                console.log(`  ${d.itemId} (${d.name}) — ${kb(before)} → sẽ nén sang .webp`);
                done++;
            }
            continue;
        }

        const r = await optimizeImageFile(abs);
        if (!r.changed) {
            console.log(`  ${d.itemId}: giữ nguyên (${kb(before)}, nén không lợi)`);
            continue;
        }

        const newUrl = '/' + path.relative(PUBLIC_DIR, r.path).split(path.sep).join('/');
        await ItemDefinition.updateOne({ _id: d._id }, { $set: { image: newUrl } });
        console.log(`  ${d.itemId}: ${kb(r.before)} → ${kb(r.after)} (-${Math.round((1 - r.after / r.before) * 100)}%)  ${newUrl}`);
        done++;
        saved += r.before - r.after;
    }

    console.log(`\n${APPLY ? 'Đã xử lý' : 'Sẽ xử lý'} ${done} ảnh${APPLY ? ` · tiết kiệm ${kb(saved)}` : ''}.`);
    if (!APPLY) console.log('Chạy lại với --apply để nén thật.');
    await mongoose.disconnect();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
