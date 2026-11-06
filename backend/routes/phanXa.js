// ===================================
// PHẢN XẠ CÂU — nhìn câu tiếng Việt, nói/gõ câu tiếng Anh, thấy ngay câu đúng
// ===================================

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { tongQuan, taoBuoi, traLoi } = require('../services/phanXa');

router.use(protect);

router.get('/tong-quan', async (req, res, next) => {
    try {
        res.json({ success: true, data: await tongQuan(req.user.id) });
    } catch (err) { next(err); }
});

/** Mở một lượt. `khung`: chỉ luyện một khung; `som`: ôn trước khi đến hạn. */
router.post('/buoi', async (req, res, next) => {
    try {
        const khung = typeof req.body?.khung === 'string' ? req.body.khung : '';
        const r = await taoBuoi(req.user.id, { khung, som: req.body?.som === true });
        res.json({ success: true, data: r.buoi });
    } catch (err) { next(err); }
});

router.post('/buoi/:id/cau/:i', async (req, res, next) => {
    try {
        const i = Number(req.params.i);
        if (!mongoose.isValidObjectId(req.params.id) || !Number.isInteger(i) || i < 0) {
            return res.status(400).json({ success: false, message: 'Câu hỏi không hợp lệ' });
        }
        const r = await traLoi(req.user.id, req.params.id, i, req.body || {});
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

module.exports = router;
