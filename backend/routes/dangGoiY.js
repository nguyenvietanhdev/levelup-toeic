// ===================================
// DẠNG BÀI GỢI Ý — các dạng hợp bộ từ của Part (Đọc hiểu, Viết, Dịch, Nghe)
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { goiYDang } = require('../services/goiYDang');

router.use(protect);

/** Khoá dạng bài hợp bộ từ của Part cho một chế độ. Lần đầu hỏi AI, sau đó lấy cache. */
router.get('/', async (req, res, next) => {
    try {
        const keys = await goiYDang({
            mode: req.query.mode,
            source: req.query.source,
            part: req.query.part,
            lang: req.query.lang,
            email: req.user.email,
            userId: req.user.id,
        });
        res.json({ success: true, data: { keys } });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        next(err);
    }
});

module.exports = router;
