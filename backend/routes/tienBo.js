// ===================================
// TIẾN BỘ CỦA TÔI — hồ sơ năng lực gom từ mọi chế độ, theo tuần
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { layTienBo } = require('../services/tienBo');
const { layTongKet, taoTongKet } = require('../services/tongKetTuan');
const { laySoTay } = require('../services/soTayLoi');
const { layChamDo } = require('../services/chamDo');

router.use(protect);

/** 8 tuần gần nhất, tính lại từ dữ liệu đã có (không gọi AI, không lưu thêm gì). */
router.get('/', async (req, res, next) => {
    try {
        const data = await layTienBo(req.user.id);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

/** Chấm đỏ trên menu: chế độ đang dở, lộ trình hôm nay, tổng kết tuần (chỉ đếm). */
router.get('/cham-do', async (req, res, next) => {
    try {
        res.json({ success: true, data: await layChamDo(req.user.id) });
    } catch (err) { next(err); }
});

/** Sổ tay lỗi: mọi lỗi đã chữa trong Viết và Dịch, kèm cách sửa (không gọi AI). */
router.get('/so-tay-loi', async (req, res, next) => {
    try {
        res.json({ success: true, data: await laySoTay(req.user.id) });
    } catch (err) { next(err); }
});

/** Tổng kết tuần này đã có chưa — chỉ đọc, KHÔNG gọi AI. */
router.get('/tong-ket', async (req, res, next) => {
    try {
        const hs = await layTienBo(req.user.id);
        res.json({ success: true, data: await layTongKet(req.user.id, hs.lang) });
    } catch (err) { next(err); }
});

/**
 * Tạo tổng kết tuần này bằng AI — chỉ khi người học bấm, mỗi tuần một lần (đã có
 * thì trả bản đã lưu, không gọi lại).
 */
router.post('/tong-ket', async (req, res, next) => {
    try {
        const r = await taoTongKet(req.user.id);
        if (r.loi) {
            return res.status(r.ma === 'it-du-lieu' ? 400 : 503).json({ success: false, message: r.loi, ma: r.ma });
        }
        res.json({ success: true, data: { tongKet: r.tongKet, daCo: r.daCo } });
    } catch (err) { next(err); }
});

module.exports = router;
