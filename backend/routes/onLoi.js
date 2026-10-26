// ===================================
// KIỂM TRA LẠI LỖI ĐÃ CHỮA — nhận ra, sửa được, hiểu vì sao, áp dụng vào câu mới
// ===================================

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { tongQuan, taoBuoi, traLoi } = require('../services/onLoi');

router.use(protect);

/** Số lỗi đang ôn / đến hạn / đã nắm / nghi học vẹt (đồng bộ lỗi mới trước khi đếm). */
router.get('/tong-quan', async (req, res, next) => {
    try {
        res.json({ success: true, data: await tongQuan(req.user.id) });
    } catch (err) { next(err); }
});

/** Mở một buổi kiểm tra. `som: true` = chưa có gì đến hạn vẫn ôn trước. */
router.post('/buoi', async (req, res, next) => {
    try {
        const r = await taoBuoi(req.user.id, { som: req.body?.som === true });
        res.json({ success: true, data: r.buoi });
    } catch (err) { next(err); }
});

/** Trả lời một câu — chấm ngay, trả đáp án và trạng thái mới của lỗi. */
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
