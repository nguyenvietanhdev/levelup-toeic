// ===================================
// ADMIN — thêm bài nghe (MP3 hoặc MP4, VOA Learning English), ẩn/hiện, sửa thông tin
// ===================================
// File KHÔNG đi qua server: trình duyệt admin tải thẳng lên Cloudinary bằng chữ ký lấy ở
// `/chu-ky`, rồi gửi `cloudinaryId` vào `POST /`. Video có thể vài chục MB, giữ trong RAM của
// server Render (512 MB) là dễ sập cả app.
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const S = require('../services/baiNghe');

router.use(protect, authorize('admin'));

const traVe = (res, r) => (r.loi
    ? res.status(r.ma || 400).json({ success: false, message: r.loi })
    : res.json({ success: true, data: r }));

router.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await S.danhSachAdmin() }); } catch (err) { next(err); }
});

router.get('/chu-ky', async (req, res) => {
    try {
        res.json({ success: true, data: await S.chuKyTaiLen() });
    } catch (e) {
        res.status(e.ma || 500).json({ success: false, message: e.ma ? e.message : 'Không tạo được chữ ký tải lên.' });
    }
});

router.get('/dung-luong', async (req, res, next) => {
    try { res.json({ success: true, data: await S.tongQuanDungLuong() }); } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        const b = req.body || {};
        traVe(res, await S.themBai({
            cloudinaryId: typeof b.cloudinaryId === 'string' ? b.cloudinaryId : '',
            url: typeof b.url === 'string' ? b.url : '',
            tieuDe: b.tieuDe,
            capDo: b.capDo,
            lang: b.lang,
            nguon: b.nguon,
            nguonUrl: b.nguonUrl,
            adminId: req.user.id,
        }));
    } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
        traVe(res, await S.xoaBai(req.params.id));
    } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
        traVe(res, await S.capNhat(req.params.id, req.body || {}));
    } catch (err) { next(err); }
});

module.exports = router;
