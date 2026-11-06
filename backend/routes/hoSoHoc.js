// ===================================
// HỒ SƠ NGƯỜI HỌC — mục tiêu, trình độ theo kỹ năng, test đầu vào
// ===================================

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { layHoSo, datMucTieu } = require('../services/hoSoHoc');
const { moTest, traLoiTest } = require('../services/kiemTraDauVao');

router.use(protect);

router.get('/', async (req, res, next) => {
    try {
        res.json({ success: true, data: await layHoSo(req.user.id) });
    } catch (err) { next(err); }
});

router.put('/muc-tieu', async (req, res, next) => {
    try {
        const ok = await datMucTieu(req.user.id, req.body?.mucTieu, { diemMucTieu: req.body?.diemMucTieu });
        if (!ok) return res.status(400).json({ success: false, message: 'Mục tiêu này chưa được hỗ trợ' });
        res.json({ success: true, data: await layHoSo(req.user.id) });
    } catch (err) { next(err); }
});

router.post('/kiem-tra', async (req, res, next) => {
    try {
        const r = await moTest(req.user.id, { coMic: req.body?.coMic !== false });
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

router.post('/kiem-tra/:id/tra-loi', async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Lượt test không hợp lệ' });
        }
        const r = await traLoiTest(req.user.id, req.params.id, req.body || {});
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

module.exports = router;
