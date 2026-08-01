/**
 * Nơi DUY NHẤT quyết định file upload đi đâu.
 *
 * Vì sao gom về một chỗ thay vì lặp nhánh `isConfigured() ? cloud : đĩa` ở từng
 * controller: ledger của dự án này đã ghi đúng bài học đó một lần — bảy hàm
 * escape song song, mỗi hàm phủ một tập ký tự khác nhau, và ba trong số đó nằm ở
 * module chưa ai audit. Ba bản sao của cùng một nhánh rồi cũng lệch nhau y hệt.
 *
 * Vấn đề nó giải: đĩa container trên Render/Railway là ephemeral — mất sạch mỗi
 * lần redeploy. Bản ghi MongoDB thì sống và vẫn trỏ `/uploads/...`. Ảnh vỡ trong
 * panel admin mà không lỗi ở đâu cả, vì một đường dẫn tĩnh 404 thì không ai log.
 *
 * Thiếu env Cloudinary → rơi về đĩa, để dev/local và test chạy được mà không cần
 * tài khoản cloud. Đó là cùng triết lý với `utils/cloudinary.js`.
 */
const fs = require('fs');
const path = require('path');
const cloud = require('./cloudinary');
const logger = require('./logger');

// Ảnh nền cosmetic còn vẽ cho TỪNG DÒNG bảng xếp hạng — để nguyên PNG 2MB là mỗi
// lần mở BXH kéo vài MB. Cùng ngưỡng với utils/imageOptimizer.js.
const MAX_EDGE = 1600;
const QUALITY = 80;
const SKIP_UNDER_BYTES = 150 * 1024;

/** Nén buffer ảnh về WebP. Lỗi nén KHÔNG được làm hỏng lượt upload — trả bản gốc. */
async function optimizeBuffer(buffer, ext) {
    if (ext === '.gif' || buffer.length < SKIP_UNDER_BYTES) return { buffer, ext };
    try {
        const sharp = require('sharp');
        const meta = await sharp(buffer).metadata();
        let img = sharp(buffer).rotate();   // theo EXIF — ảnh điện thoại hay bị xoay
        if (Math.max(meta.width || 0, meta.height || 0) > MAX_EDGE) {
            img = img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
        }
        const out = await img.webp({ quality: QUALITY }).toBuffer();
        // Hiếm nhưng có: ảnh gốc đã tối ưu tốt hơn bản nén.
        return out.length < buffer.length ? { buffer: out, ext: '.webp' } : { buffer, ext };
    } catch (err) {
        logger.warn('Không nén được ảnh, giữ bản gốc', { error: err.message });
        return { buffer, ext };
    }
}

/**
 * Lưu một buffer và trả URL để ghi vào DB.
 *
 * @param {Buffer} buffer
 * @param {object} opts
 *   folder        thư mục trên Cloudinary, vd 'reports' | 'avatars' | 'shop/frame'
 *   diskDir       thư mục tuyệt đối cho fallback đĩa
 *   publicPrefix  tiền tố URL của fallback, vd '/uploads/reports'
 *   originalname  tên file gốc (lấy đuôi)
 *   basename      tên file mong muốn (không đuôi); bỏ trống → sinh theo thời gian
 *   resourceType  'image' | 'video' (Cloudinary xếp audio vào nhóm video)
 *   optimize      nén ảnh về WebP trước khi lưu
 * @returns {Promise<string>} URL tuyệt đối (Cloudinary) hoặc `/uploads/...` (đĩa)
 */
async function storeUpload(buffer, {
    folder,
    diskDir,
    publicPrefix,
    originalname = '',
    basename,
    resourceType = 'image',
    optimize = false,
} = {}) {
    let ext = (path.extname(originalname) || '.bin').toLowerCase();
    let body = buffer;

    if (optimize && resourceType === 'image') {
        const r = await optimizeBuffer(buffer, ext);
        body = r.buffer;
        ext = r.ext;
    }

    const name = basename || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (cloud.isConfigured()) {
        return cloud.uploadBuffer(body, { folder, resourceType, publicId: name });
    }

    // ── Fallback đĩa: chỉ dành cho dev/local. Trên platform, thiếu env Cloudinary
    // nghĩa là file sẽ biến mất ở lần redeploy kế tiếp.
    fs.mkdirSync(diskDir, { recursive: true });
    const filename = `${name}${ext}`;
    fs.writeFileSync(path.join(diskDir, filename), body);
    return `${publicPrefix}/${filename}`;
}

module.exports = { storeUpload, optimizeBuffer, MAX_EDGE, QUALITY, SKIP_UNDER_BYTES };
