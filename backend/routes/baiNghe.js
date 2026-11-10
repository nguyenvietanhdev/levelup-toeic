// ===================================
// BÀI NGHE CÓ SCRIPT — thư viện và một bài (người học đã đăng nhập)
// ===================================
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { danhSach, layBai } = require('../services/baiNghe');

router.use(protect);

router.get('/', async (req, res, next) => {
    try {
        res.json({ success: true, data: await danhSach(req.query.lang === 'zh' ? 'zh' : 'en') });
    } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
        const r = await layBai(req.params.id);
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

module.exports = router;
