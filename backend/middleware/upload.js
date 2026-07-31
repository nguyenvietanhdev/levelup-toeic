const multer = require('multer');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// ===================================
// HELPER — chọn thư mục & tên file cho ảnh/audio câu hỏi TOEIC
// ===================================

// Tên thư mục an toàn: chỉ chữ/số/-/_ ; rỗng → null.
const sanitizeFolder = (v) => {
    const s = String(v || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return s || null;
};

// Quyết định thư mục con theo THỨ TỰ ưu tiên:
//   1. ?source=... trên query (form gửi Source đang chọn) — đúng ý người dùng nhất.
//   2. Tiền tố trước "p<số>" trong tên file (quy ước cũ e2e9p1_1 → e2e9).
//   3. 'other' khi không suy ra được.
const resolveTestFolder = (req, file) => {
    const fromQuery = sanitizeFolder(req.query.source);
    if (fromQuery) return fromQuery;
    const match = file.originalname.match(/^([a-z0-9]+)p\d+/i);
    return match ? match[1].toLowerCase() : 'other';
};

// Giữ tên gốc nhưng thêm hậu tố ngắn khi ĐÃ tồn tại → không đè file cũ.
// (Trùng tên là chuyện thường vì mỗi bộ đề hay đánh số lại từ 1.)
const uniqueFilename = (destPath, originalname) => {
    const ext = path.extname(originalname);
    const base = path.basename(originalname, ext);
    let name = originalname;
    let i = 1;
    while (fs.existsSync(path.join(destPath, name))) {
        name = `${base}-${i}${ext}`;
        i += 1;
    }
    return name;
};

// ===================================
// IMAGE UPLOAD CONFIGURATION
// ===================================

const imageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const destPath = `public/assets/images/${resolveTestFolder(req, file)}/`;
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
        }
        cb(null, destPath);
    },
    filename: function (req, file, cb) {
        cb(null, uniqueFilename(`public/assets/images/${resolveTestFolder(req, file)}/`, file.originalname));
    }
});

const imageFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
};

const uploadImage = multer({
    storage: imageStorage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
    },
    fileFilter: imageFilter,
});

// Bản MEMORY cho ảnh TOEIC — giữ file trong RAM để controller quyết định đẩy
// lên Cloudinary (nếu có env) hay ghi đĩa (fallback). Cùng filter/limit.
const uploadImageMem = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFilter,
});

// ===================================
// AUDIO UPLOAD CONFIGURATION
// ===================================

const audioStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const destPath = `public/assets/audio/${resolveTestFolder(req, file)}/`;
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
        }
        cb(null, destPath);
    },
    filename: function (req, file, cb) {
        cb(null, uniqueFilename(`public/assets/audio/${resolveTestFolder(req, file)}/`, file.originalname));
    }
});

const audioFilter = (req, file, cb) => {
    const allowedExtensions = /mp3|wav|ogg|m4a|aac/;
    const allowedMimeTypes = /audio\/(mpeg|mp3|wav|ogg|m4a|aac|x-m4a|x-wav)/;

    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimeTypes.test(file.mimetype);

    logger.debug('🎵 Audio upload attempt:', {
        filename: file.originalname,
        mimetype: file.mimetype,
        extension: path.extname(file.originalname),
        extensionValid: extname,
        mimetypeValid: mimetype
    });

    // Accept if EITHER extension OR mimetype is valid (some browsers report wrong MIME types)
    if (mimetype || extname) {
        return cb(null, true);
    } else {
        cb(new Error(`Invalid audio file. File: ${file.originalname}, Type: ${file.mimetype}`));
    }
};

const uploadAudio = multer({
    storage: audioStorage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max for audio
    },
    fileFilter: audioFilter,
});

// Bản MEMORY cho audio TOEIC (xem uploadImageMem).
const uploadAudioMem = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: audioFilter,
});

// ===================================
// AVATAR UPLOAD CONFIGURATION
// ===================================

const avatarDir = path.join(__dirname, '../public/uploads/avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarDir),
    filename: (req, file, cb) => {
        // Dùng userId làm tên file → tự động ghi đè khi update
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${req.user.id}${ext}`);
    },
});

const avatarFilter = (req, file, cb) => {
    if (/image\/(jpeg|jpg|png|gif|webp)/.test(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ hỗ trợ file ảnh (jpeg, png, gif, webp)'));
    }
};

const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: avatarFilter,
});

// ===================================
// COSMETIC / SHOP IMAGE UPLOAD (admin)
// Lưu theo vai trò: public/uploads/{role}/  (background | avatar | frame | item | spin)
// Phục vụ tại /uploads/{role}/<file>. Ưu tiên hiển thị thay icon khi có ảnh.
// ===================================
const SHOP_IMAGE_ROLES = ['background', 'avatar', 'frame', 'item', 'spin'];

// Role = thư mục lưu ảnh, nay khớp KEY danh mục (consumable/boost/…). Sanitize để
// chỉ nhận ký tự an toàn cho tên folder; rỗng → 'item'. Folder tự tạo khi upload.
const sanitizeRole = (r) => String(r || 'item').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'item';

const shopImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const role = sanitizeRole(req.query.role);
        const dir = path.join(__dirname, '../public/uploads', role);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const base = path.basename(file.originalname, ext)
            .toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 40) || 'img';
        cb(null, `${base}-${Date.now()}${ext}`);
    },
});

const uploadShopImage = multer({
    storage: shopImageStorage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
    fileFilter: imageFilter,
});

module.exports = {
    uploadImage,
    uploadAudio,
    uploadImageMem,
    uploadAudioMem,
    uploadAvatar,
    uploadShopImage,
    SHOP_IMAGE_ROLES,
    sanitizeRole,
    // Dùng lại cho nhánh fallback lưu đĩa trong controller.
    resolveTestFolder,
    uniqueFilename,
    sanitizeFolder,
};
