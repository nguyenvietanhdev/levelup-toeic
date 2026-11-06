// ===================================
// CÔNG THỨC NGỮ PHÁP — tra cứu kho lõi, AI mở rộng khi cần
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { tim, hoi, themViDu } = require('../services/nguPhap');

router.use(protect);

/** Tra cứu, không gọi AI. */
router.get('/', async (req, res, next) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        res.json({ success: true, data: await tim(req.user.id, q) });
    } catch (err) { next(err); }
});

/** Hỏi AI về chủ điểm chưa có; đã có người hỏi thì trả bản đã lưu. */
router.post('/hoi', async (req, res, next) => {
    try {
        const r = await hoi(req.user.id, req.body?.q);
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
