// ===================================
// CÔNG THỨC NGỮ PHÁP — tra cứu, AI nhận diện chủ điểm đã có và soạn nháp mục mới
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { tim, hoi, themVaoThuVien, themViDu } = require('../services/nguPhap');

router.use(protect);

/** Tra cứu, không gọi AI. */
router.get('/', async (req, res, next) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        res.json({ success: true, data: await tim(req.user.id, q) });
    } catch (err) { next(err); }
});

/** Tra chủ điểm chưa thấy: mở mục đã có, hoặc trả nháp chờ người học quyết định. */
router.post('/hoi', async (req, res, next) => {
    try {
        const r = await hoi(req.user.id, req.body?.q);
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

/** Người học đồng ý đưa nháp vào thư viện chung. */
router.post('/nhap/:id/them', async (req, res, next) => {
    try {
        const r = await themVaoThuVien(req.user.id, req.params.id);
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

router.post('/:id/vi-du', async (req, res, next) => {
    try {
        const r = await themViDu(req.user.id, String(req.params.id).slice(0, 60));
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

module.exports = router;
