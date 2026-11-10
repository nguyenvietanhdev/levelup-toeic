// ===================================
// ADMIN — thêm bài nghe từ file âm thanh (VOA Learning English), ẩn/hiện, sửa thông tin
// ===================================
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const S = require('../services/baiNghe');

router.use(protect, authorize('admin'));

// Giữ trong RAM rồi đẩy thẳng lên Cloudinary và Whisper: ổ đĩa Render mất khi khởi động lại.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: S.TOI_DA_BYTE, files: 1 },
    fileFilter: (req, file, cb) => cb(null, /^(audio|video)\//.test(file.mimetype)),
});

const traVe = (res, r) => (r.loi
    ? res.status(r.ma || 400).json({ success: false, message: r.loi })
    : res.json({ success: true, data: r }));

router.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await S.danhSachAdmin() }); } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
    upload.single('audio')(req, res, (loi) => {
        if (loi) return res.status(400).json({ success: false, message: loi.code === 'LIMIT_FILE_SIZE' ? 'File âm thanh lớn hơn 25 MB.' : 'File tải lên không hợp lệ.' });
        S.themBai({
            url: req.body?.url,
            buffer: req.file?.buffer,
            tenFile: req.file?.originalname,
            tieuDe: req.body?.tieuDe,
            capDo: req.body?.capDo,
            lang: req.body?.lang,
            nguon: req.body?.nguon,
            nguonUrl: req.body?.nguonUrl,
            adminId: req.user.id,
        }).then((r) => traVe(res, r)).catch(next);
        return undefined;
    });
});

router.patch('/:id', async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
        traVe(res, await S.capNhat(req.params.id, req.body || {}));
    } catch (err) { next(err); }
});

module.exports = router;
