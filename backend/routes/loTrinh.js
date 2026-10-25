// ===================================
// LỘ TRÌNH HÔM NAY — các bước học trong ngày và bước nào đã xong
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { layLoTrinh } = require('../services/loTrinh');

router.use(protect);

/** Tiến độ hôm nay, tính từ dữ liệu đã có (không lưu thêm gì). */
router.get('/', async (req, res, next) => {
    try {
        const data = await layLoTrinh(req.user.id);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

module.exports = router;
