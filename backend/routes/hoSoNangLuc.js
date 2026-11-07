// ===================================
// HỒ SƠ NĂNG LỰC — một trang gộp mọi thứ hệ thống biết về người học
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { layHoSoNangLuc } = require('../services/hoSoNangLuc');

router.use(protect);

router.get('/', async (req, res, next) => {
    try {
        res.json({ success: true, data: await layHoSoNangLuc(req.user.id) });
    } catch (err) { next(err); }
});

module.exports = router;
