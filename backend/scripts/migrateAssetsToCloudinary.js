/**
 * Đẩy ảnh/audio TOEIC ĐANG LƯU ĐĨA lên Cloudinary rồi VIẾT LẠI URL trong DB.
 *
 * Quét ToeicQuestionSet: mọi imageUrls[] bắt đầu bằng /assets/images và audioUrl
 * bắt đầu bằng /assets/audio → upload file tương ứng ở public/ lên Cloudinary,
 * thay URL bằng secure_url (https). URL đã là http(s) (đã lên cloud) → bỏ qua.
 *
 * Chạy:
 *   node scripts/migrateAssetsToCloudinary.js          (XEM TRƯỚC, không ghi)
 *   node scripts/migrateAssetsToCloudinary.js --apply   (ghi vào DB)
 *
 * Cần 3 biến env CLOUDINARY_* — thiếu thì dừng ngay.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cloud = require('../utils/cloudinary');
const ToeicQuestionSet = require('../models/ToeicQuestionSet');

const APPLY = process.argv.includes('--apply');
const PUB = path.join(__dirname, '..', 'public');

// URL /assets/images/ets26t1/x.png → { abs, folder, kind, resourceType }
function localInfo(url, kind) {
    if (!url || /^https?:/i.test(url)) return null;         // đã lên cloud / rỗng
    const rel = url.replace(/^\//, '');
    const abs = path.join(PUB, rel);
    if (!fs.existsSync(abs)) return { abs, missing: true };
    const parts = rel.split('/');
    const folder = parts[2] || 'other';                      // assets/<kind>/<folder>/file
    return {
        abs,
        folder,
        resourceType: kind === 'audio' ? 'video' : 'image',
        cloudFolder: `toeic/${kind}/${folder}`,
        publicId: path.parse(abs).name,
    };
}

(async () => {
    if (!cloud.isConfigured()) {
        console.error('❌ Chưa cấu hình Cloudinary (thiếu CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET).');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/toeic');

    const sets = await ToeicQuestionSet.find({}).select('source imageUrls audioUrl');
    let imgTotal = 0, audTotal = 0, uploaded = 0, missing = 0, skipped = 0;

    for (const set of sets) {
        let dirty = false;

        // Ảnh (nhiều ảnh mỗi màn)
        if (Array.isArray(set.imageUrls)) {
            for (let i = 0; i < set.imageUrls.length; i++) {
                const info = localInfo(set.imageUrls[i], 'images');
                if (!info) { skipped++; continue; }
                imgTotal++;
                if (info.missing) { missing++; console.warn('  ⚠ thiếu file:', set.imageUrls[i]); continue; }
                if (APPLY) {
                    const url = await cloud.uploadFile(info.abs, info);
                    set.imageUrls[i] = url; dirty = true; uploaded++;
                } else { uploaded++; }
            }
        }

        // Audio (một file chung mỗi màn)
        const aInfo = localInfo(set.audioUrl, 'audio');
        if (aInfo) {
            audTotal++;
            if (aInfo.missing) { missing++; console.warn('  ⚠ thiếu file:', set.audioUrl); }
            else if (APPLY) {
                const url = await cloud.uploadFile(aInfo.abs, aInfo);
                set.audioUrl = url; dirty = true; uploaded++;
            } else { uploaded++; }
        } else if (set.audioUrl) { skipped++; }

        if (dirty) await set.save();
    }

    console.log(`\n${APPLY ? '✅ ĐÃ GHI' : '👀 XEM TRƯỚC (chưa ghi)'}:`);
    console.log(`  Ảnh cần đẩy: ${imgTotal} · Audio cần đẩy: ${audTotal}`);
    console.log(`  ${APPLY ? 'Đã upload' : 'Sẽ upload'}: ${uploaded} · Bỏ qua (đã cloud): ${skipped} · Thiếu file: ${missing}`);
    if (!APPLY) console.log('\n  Chạy lại với --apply để thực sự đẩy lên và viết lại URL.');

    await mongoose.disconnect();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
