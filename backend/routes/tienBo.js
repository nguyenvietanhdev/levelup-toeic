// ===================================
// TIẾN BỘ CỦA TÔI — hồ sơ năng lực gom từ mọi chế độ, theo tuần
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { layTienBo } = require('../services/tienBo');

router.use(protect);

/** 8 tuần gần nhất, tính lại từ dữ liệu đã có (không gọi AI, không lưu thêm gì). */
router.get('/', async (req, res, next) => {
    try {
        const data = await layTienBo(req.user.id);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

module.exports = router;
