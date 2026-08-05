/**
 * Đẩy ảnh COSMETIC/SHOP đang lưu đĩa (`/uploads/...`) lên Cloudinary rồi VIẾT LẠI
 * URL trong DB.
 *
 * Vì sao cần: đĩa container trên Render/Railway là ephemeral — mất sạch mỗi lần
 * redeploy. Bản ghi MongoDB thì sống và vẫn trỏ `/uploads/avatar/avt-fox-990.png`,
 * nên ảnh 404 mà không có lỗi ở đâu cả: một đường dẫn tĩnh không tồn tại thì
 * chẳng ai ghi log. Đây là `DEPLOY-deployment-004`.
 *
 * Bản vá `6238a5b` đã chuyển MỌI luồng upload sang Cloudinary, nhưng chỉ đúng cho
 * file upload TỪ NAY. File cũ vẫn trỏ đĩa — script này dọn phần quá khứ đó.
 *
 * KHÁC với `migrateAssetsToCloudinary.js`: script kia phủ ảnh/audio đề TOEIC
 * (`/assets/...` trong ToeicQuestionSet). Script này phủ `/uploads/...`.
 *
 * Chạy:
 *   node scripts/migrateUploadsToCloudinary.js           (XEM TRƯỚC, không ghi)
 *   node scripts/migrateUploadsToCloudinary.js --apply    (ghi vào DB)
 *
 * Cần 3 biến env CLOUDINARY_* — thiếu thì dừng ngay.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cloud = require('../utils/cloudinary');

const APPLY = process.argv.includes('--apply');
const PUB = path.join(__dirname, '..', 'public');

/**
 * Nơi cần quét — lấy từ lượt quét toàn bộ 43 collection tìm chuỗi bắt đầu bằng
 * `/uploads/`, không phải đoán. `path` là đường dẫn field; `[]` nghĩa là mảng.
 */
const TARGETS = [
    { collection: 'shop_items',       path: 'image' },
    { collection: 'item_definitions', path: 'image' },
    { collection: 'spinconfigs',      path: 'prizes[].image' },
];

/** Mọi vị trí khớp `path` trong `doc`, dạng { get(), set(v) }. */
function slots(doc, spec) {
    const [head, tail] = spec.split('[].');
    if (tail === undefined) {
        return [{ get: () => doc[spec], set: (v) => { doc[spec] = v; } }];
    }
    const arr = doc[head];
    if (!Array.isArray(arr)) return [];
    return arr
        .filter(el => el && typeof el === 'object')
        .map(el => ({ get: () => el[tail], set: (v) => { el[tail] = v; } }));
}

/** `/uploads/avatar/x.png` → thông tin upload, hoặc null nếu không thuộc phạm vi. */
function localInfo(url) {
    if (!url || typeof url !== 'string') return null;
    if (/^https?:/i.test(url)) return null;                   // đã lên cloud
    if (!url.startsWith('/uploads/')) return null;
    const rel = url.replace(/^\//, '');
    const abs = path.join(PUB, rel);
    const role = rel.split('/')[1] || 'item';                 // uploads/<role>/file
    return {
        url,
        abs,
        missing: !fs.existsSync(abs),
        resourceType: 'image',
        folder: `shop/${role}`,
        publicId: path.parse(abs).name,
    };
}

(async () => {
    if (!cloud.isConfigured()) {
        console.error('❌ Chưa cấu hình Cloudinary (thiếu CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET).');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);

    let found = 0, uploaded = 0;
    const missingList = [];

    for (const target of TARGETS) {
        const col = mongoose.connection.collection(target.collection);

        for (const doc of await col.find({}).toArray()) {
            let dirty = false;

            for (const slot of slots(doc, target.path)) {
                const info = localInfo(slot.get());
                if (!info) continue;
                found++;

                if (info.missing) {
                    // GIỮ NGUYÊN URL cũ. Xoá là mất dấu vết để lần lại sau.
                    missingList.push(`${target.collection} · ${info.url}`);
                    continue;
                }
                if (!APPLY) { uploaded++; continue; }

                const secure = await cloud.uploadFile(info.abs, info);
                slot.set(secure);
                dirty = true;
                uploaded++;
                console.log(`  ↑ ${info.url}\n      → ${secure}`);
            }

            if (dirty) {
                const { _id, ...rest } = doc;
                await col.updateOne({ _id }, { $set: rest });
            }
        }
    }

    console.log(`\n${APPLY ? '✅ ĐÃ GHI' : '👀 XEM TRƯỚC (chưa ghi)'}:`);
    console.log(`  Tham chiếu /uploads/ tìm thấy: ${found}`);
    console.log(`  ${APPLY ? 'Đã upload' : 'Sẽ upload'}: ${uploaded} · Thiếu file trên đĩa: ${missingList.length}`);
    if (missingList.length) {
        console.log('\n  ⚠ Thiếu file — giữ nguyên URL cũ, KHÔNG xoá:');
        missingList.forEach(l => console.log('    ' + l));
    }
    if (!APPLY) console.log('\n  Chạy lại với --apply để thực sự đẩy lên và viết lại URL.');

    await mongoose.disconnect();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
