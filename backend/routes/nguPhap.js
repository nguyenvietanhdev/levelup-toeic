// ===================================
// CÔNG THỨC NGỮ PHÁP — tra cứu, AI nhận diện chủ điểm đã có và soạn nháp mục mới
// ===================================

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { tim, hoi, themVaoThuVien, themViDu } = require('../services/nguPhap');
const { moLuot, traLoi, ganTienDo } = require('../services/nguPhapLuyen');
const { baoSaiCau, baoSaiMuc } = require('../services/nguPhapBaoSai');

router.use(protect);

/** Tra cứu, không gọi AI. */
router.get('/', async (req, res, next) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const data = await tim(req.user.id, q, undefined, req.query.lang);
        res.json({ success: true, data: { ...data, muc: await ganTienDo(req.user.id, data.muc) } });
    } catch (err) { next(err); }
});

/** Tra chủ điểm chưa thấy: mở mục đã có, hoặc trả nháp chờ người học quyết định. */
router.post('/hoi', async (req, res, next) => {
    try {
        const r = await hoi(req.user.id, req.body?.q, undefined, req.body?.lang);
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

/** Trả lời một câu trong lượt luyện. Đặt trước `/:id/...` để `buoi` không bị hiểu là id mục. */
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

/** Báo một câu luyện đã trả lời bị sai. */
router.post('/buoi/:id/cau/:i/bao-sai', async (req, res, next) => {
    try {
        const i = Number(req.params.i);
        if (!mongoose.isValidObjectId(req.params.id) || !Number.isInteger(i) || i < 0) {
            return res.status(400).json({ success: false, message: 'Câu hỏi không hợp lệ' });
        }
        const r = await baoSaiCau(req.user.id, req.params.id, i);
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

/** Báo một mục do AI tạo trong thư viện bị sai. */
router.post('/:id/bao-sai', async (req, res, next) => {
    try {
        const r = await baoSaiMuc(req.user.id, String(req.params.id).slice(0, 60));
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

/** Mở một lượt luyện công thức này. */
router.post('/:id/luyen', async (req, res, next) => {
    try {
        const r = await moLuot(req.user.id, String(req.params.id).slice(0, 60));
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
