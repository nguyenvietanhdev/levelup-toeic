// ===================================
// TRA CỨU PHÁT ÂM — phiên âm chuẩn, cách đọc kiểu tiếng Việt, nối âm (mọi ngôn ngữ trong sổ)
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { tra, conLuot } = require('../services/phatAm');

router.use(protect);

/** Số lượt AI còn lại hôm nay (không gọi AI). */
router.get('/luot', async (req, res, next) => {
    try { res.json({ success: true, data: { conLuot: await conLuot(req.user.id, new Date()) } }); } catch (err) { next(err); }
});

/** Tra một từ / cụm / câu: dùng kết quả đã lưu nếu có, không thì hỏi AI (tính một lượt). */
router.post('/tra', async (req, res, next) => {
    try {
        const r = await tra(req.user.id, { text: req.body?.text, lang: req.body?.lang });
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

module.exports = router;
