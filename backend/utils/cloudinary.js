// Cầu nối Cloudinary cho ảnh/audio TOEIC.
//
// Triết lý: CHỈ bật khi có đủ 3 biến env (CLOUDINARY_CLOUD_NAME / _API_KEY /
// _API_SECRET). Thiếu → coi như chưa cấu hình, hệ thống rơi về lưu ĐĨA như cũ.
// Nhờ vậy dev/máy local và test chạy bình thường mà không cần tài khoản cloud,
// còn production (Render/Railway) chỉ cần đặt 3 biến là tự dùng cloud.
const cloudinary = require('cloudinary').v2;
const logger = require('./logger');

const {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
} = process.env;

const configured = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

if (configured) {
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
    });
}

/** Có cấu hình Cloudinary hay không (thiếu env → false → lưu đĩa). */
function isConfigured() {
    return configured;
}

/**
 * Upload một buffer lên Cloudinary.
 * @param {Buffer} buffer  nội dung file
 * @param {object} opts
 *        folder      thư mục trên Cloudinary (vd 'toeic/images/ets26t1')
 *        resourceType 'image' | 'video' (audio để 'video' — Cloudinary xếp
 *                     audio chung nhóm video)
 *        publicId    tên file (không đuôi); trùng thì Cloudinary tự thêm hậu tố
 * @returns {Promise<string>} secure_url (https) để lưu vào DB
 */
function uploadBuffer(buffer, { folder, resourceType = 'image', publicId } = {}) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: resourceType,
                public_id: publicId,
                use_filename: !!publicId,
                unique_filename: true, // tránh đè file cùng tên
                overwrite: false,
            },
            (err, result) => {
                if (err) return reject(err);
                resolve(result.secure_url);
            }
        );
        stream.end(buffer);
    });
}

/** Upload một FILE trên đĩa (dùng cho migration dữ liệu cũ). */
async function uploadFile(filePath, opts = {}) {
    const result = await cloudinary.uploader.upload(filePath, {
        folder: opts.folder,
        resource_type: opts.resourceType || 'image',
        public_id: opts.publicId,
        use_filename: !!opts.publicId,
        unique_filename: true,
        overwrite: false,
    });
    return result.secure_url;
}

module.exports = { cloudinary, isConfigured, uploadBuffer, uploadFile, logger };
