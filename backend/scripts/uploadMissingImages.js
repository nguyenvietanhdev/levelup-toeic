/**
 * Upload nốt các ảnh TOEIC còn trỏ đường đĩa `/assets/images/...` trong DB lên
 * Cloudinary (folder phẳng theo đề, vd `ets26t1/`), rồi cập nhật URL trong DB.
 * Chỉ xử lý ảnh mà FILE GỐC ĐÃ CÓ trên đĩa (bạn thả vào public/assets/images/<de>/).
 * Ảnh chưa có file thì bỏ qua + liệt kê ra để biết còn thiếu.
 *
 *   node scripts/uploadMissingImages.js           # dry-run (chỉ in)
 *   node scripts/uploadMissingImages.js --apply    # upload + ghi DB
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Q = require('../models/ToeicQuestionSet');
const { cloudinary, isConfigured, uploadFile } = require('../utils/cloudinary');

const APPLY = process.argv.includes('--apply');
const PUB = path.join(__dirname, '..', 'public');
const LOCAL = '/assets/images/';

(async () => {
    if (!isConfigured()) { console.error('Cloudinary chưa cấu hình env — dừng.'); process.exit(1); }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`DB: ${mongoose.connection.name} | mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

    // Gom mọi tham chiếu ảnh local: url -> danh sách {doc,index}
    const docs = await Q.find({ imageUrls: { $elemMatch: { $regex: LOCAL } } });
    const refs = new Map(); // url -> [{doc, i}]
    for (const doc of docs) {
        doc.imageUrls.forEach((u, i) => {
            if (typeof u === 'string' && u.includes(LOCAL)) {
                if (!refs.has(u)) refs.set(u, []);
                refs.get(u).push({ doc, i });
            }
        });
    }

    let uploaded = 0; const missing = [];
    const dirty = new Set();

    for (const [url, uses] of refs) {
        const rel = url.replace(/^\//, '');            // assets/images/ets26t1/ets26t1-71-73.png
        const abs = path.join(PUB, rel);
        const testId = rel.split('/')[2] || 'other';   // ets26t1
        const base = path.parse(abs).name;             // ets26t1-71-73

        if (!fs.existsSync(abs)) { missing.push(rel); continue; }

        console.log(`  ${rel}  →  cloud ${testId}/${base}`);
        if (APPLY) {
            const secureUrl = await uploadFile(abs, {
                folder: testId, resourceType: 'image', publicId: base,
            });
            // Dynamic folder mode: ép vị trí hiển thị về phẳng theo đề.
            try { await cloudinary.api.update(`${testId}/${base}`, { resource_type: 'image', asset_folder: testId }); } catch (_) {}
            uses.forEach(({ doc, i }) => { doc.imageUrls[i] = secureUrl; dirty.add(doc); });
            fs.unlinkSync(abs); // Đã lên cloud (nguồn chính) → xoá bản local thừa.
        }
        uploaded++;
    }

    if (APPLY) for (const doc of dirty) { doc.markModified('imageUrls'); await doc.save(); }

    console.log(`\nĐã ${APPLY ? 'upload + cập nhật DB' : 'sẽ upload (dry-run)'}: ${uploaded} ảnh.`);
    if (missing.length) {
        console.log(`\nCHƯA CÓ FILE trên đĩa (${missing.length}) — thả vào public/... rồi chạy lại:`);
        missing.sort().forEach((r) => console.log('   ', r));
    }
    await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
