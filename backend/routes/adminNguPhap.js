// ===================================
// ADMIN — nội dung ngữ pháp do AI tạo: báo cáo sai và thư viện
// ===================================

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Q = require('../services/nguPhapQuanTri');

router.use(protect, authorize('admin'));

const traVe = (res, r) => (r.loi
    ? res.status(r.ma || 400).json({ success: false, message: r.loi })
    : res.json({ success: true, data: r }));
const idHopLe = (req, res, next) => (mongoose.isValidObjectId(req.params.id)
    ? next()
    : res.status(400).json({ success: false, message: 'Id không hợp lệ' }));

router.get('/bao-sai', async (req, res, next) => {
    try {
        res.json({ success: true, data: await Q.danhSachBaoCao({ trangThai: req.query.trangThai, trang: req.query.trang }) });
    } catch (err) { next(err); }
});

router.post('/bao-sai/:id/khoi-phuc', idHopLe, async (req, res, next) => {
    try { traVe(res, await Q.khoiPhuc(req.params.id)); } catch (err) { next(err); }
});

router.post('/bao-sai/:id/xac-nhan', idHopLe, async (req, res, next) => {
    try { traVe(res, await Q.xacNhanSai(req.params.id)); } catch (err) { next(err); }
});

router.get('/thu-vien', async (req, res, next) => {
    try {
        res.json({ success: true, data: await Q.danhSachThuVien({ trang: req.query.trang }) });
    } catch (err) { next(err); }
});

router.post('/thu-vien/:id/an', idHopLe, async (req, res, next) => {
    try { traVe(res, await Q.anMuc(req.user.id, req.params.id)); } catch (err) { next(err); }
});

module.exports = router;
