/**
 * Nén ảnh cosmetic (nền / khung / avatar / vật phẩm) về WebP.
 *
 * Vì sao cần: ảnh nền upload thẳng từ máy hay là PNG 1536×1024 nặng 2-3MB. Nền
 * hồ sơ còn đỡ, nhưng nền cosmetic còn vẽ cho TỪNG DÒNG bảng xếp hạng — mở BXH
 * một lần là kéo vài MB, và người chơi thấy gradient nhấp nháy trước khi ảnh về.
 * WebP q80 cùng kích thước thường nhỏ hơn 10-20 lần mà mắt thường không phân biệt.
 *
 * Trả về đường dẫn file MỚI (đuôi .webp) — file gốc giữ nguyên, để người gọi tự
 * quyết định xoá hay không.
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// 1600px thừa sức cho nền header rộng nhất; to hơn chỉ tốn byte.
const MAX_EDGE = 1600;
const QUALITY = 80;

/** Ảnh đã đủ nhẹ thì nén cũng chẳng để làm gì. */
const SKIP_UNDER_BYTES = 150 * 1024;

/**
 * @param {string} absPath  đường dẫn tuyệt đối tới ảnh vừa upload
 * @returns {Promise<{changed:boolean, path:string, before:number, after:number}>}
 */
async function optimizeImageFile(absPath) {
    const sharp = require('sharp');
    const before = fs.statSync(absPath).size;
    const ext = path.extname(absPath).toLowerCase();

    // GIF động nén kiểu này là mất animation → để nguyên.
    if (ext === '.gif' || before < SKIP_UNDER_BYTES) {
        return { changed: false, path: absPath, before, after: before };
    }

    const outPath = absPath.replace(/\.[^.]+$/, '') + '.webp';
    const meta = await sharp(absPath).metadata();

    let img = sharp(absPath).rotate(); // theo EXIF, ảnh chụp điện thoại hay bị xoay
    if (Math.max(meta.width || 0, meta.height || 0) > MAX_EDGE) {
        img = img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
    }
    await img.webp({ quality: QUALITY }).toFile(outPath);

    const after = fs.statSync(outPath).size;

    // Hiếm nhưng có: ảnh gốc đã tối ưu tốt hơn → bỏ bản webp, giữ nguyên gốc.
    if (after >= before) {
        fs.unlinkSync(outPath);
        return { changed: false, path: absPath, before, after: before };
    }

    return { changed: true, path: outPath, before, after };
}

/**
 * Bọc cho luồng upload: nén file multer vừa ghi, trả URL /uploads/... nên dùng.
 * Lỗi nén KHÔNG được làm hỏng cả lượt upload — cùng lắm là giữ ảnh gốc.
 */
async function optimizeUploaded(absPath, publicUrl) {
    try {
        const r = await optimizeImageFile(absPath);
        if (!r.changed) return publicUrl;

        fs.unlinkSync(absPath); // bản gốc nặng không còn ai trỏ tới
        const url = publicUrl.replace(/\.[^.]+$/, '') + '.webp';
        logger.info('Nén ảnh upload', {
            url, before: r.before, after: r.after,
            saved: `${Math.round((1 - r.after / r.before) * 100)}%`,
        });
        return url;
    } catch (err) {
        logger.warn('Không nén được ảnh, giữ bản gốc', { absPath, error: err.message });
        return publicUrl;
    }
}

module.exports = { optimizeImageFile, optimizeUploaded, MAX_EDGE, QUALITY, SKIP_UNDER_BYTES };
