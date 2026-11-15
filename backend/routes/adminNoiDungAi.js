// ===================================
// ADMIN — quản lý mọi nội dung AI đã lưu trong DB: xem, thêm, sửa, xoá/ẩn
// ===================================

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { danhSachLoai, lam } = require('../services/noiDungAi');

router.use(protect, authorize('admin'));

const traVe = (res, r) => (r?.loi
    ? res.status(r.ma || 400).json({ success: false, message: r.loi })
    : res.json({ success: true, data: r }));
const id = (req) => String(req.params.id || '').slice(0, 80);
const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

/** Các loại nội dung AI và cột hiển thị. */
router.get('/', (req, res) => res.json({ success: true, data: danhSachLoai() }));

/** Ô nhập của form thêm/sửa (có loại cần đọc danh sách chủ điểm). */
router.get('/:loai/truong', async (req, res, next) => {
    try { traVe(res, await lam(req.params.loai, 'truong')); } catch (err) { next(err); }
});

router.get('/:loai', async (req, res, next) => {
    try { traVe(res, await lam(req.params.loai, 'ds', req.query)); } catch (err) { next(err); }
});

router.post('/:loai', async (req, res, next) => {
    try { traVe(res, await lam(req.params.loai, 'tao', body(req), { adminId: req.user.id })); } catch (err) { next(err); }
});

router.patch('/:loai/:id', async (req, res, next) => {
    try { traVe(res, await lam(req.params.loai, 'capNhat', id(req), body(req), { adminId: req.user.id })); } catch (err) { next(err); }
});

/** Ẩn / hiện lại (loại chỉ ẩn được, như câu luyện ngữ pháp). */
router.post('/:loai/:id/an', async (req, res, next) => {
    try { traVe(res, await lam(req.params.loai, 'datAn', id(req), body(req).an !== false)); } catch (err) { next(err); }
});

router.delete('/:loai/:id', async (req, res, next) => {
    try { traVe(res, await lam(req.params.loai, 'xoaMuc', id(req), { adminId: req.user.id })); } catch (err) { next(err); }
});

module.exports = router;
