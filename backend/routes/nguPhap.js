// ===================================
// CÔNG THỨC NGỮ PHÁP — tra cứu, AI nhận diện chủ điểm đã có và soạn nháp mục mới
// ===================================

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { tim, hoi, themVaoThuVien, themViDu } = require('../services/nguPhap');
const { moLuot, traLoi, ganTienDo, moTongHop, thongKeNganHang, moRongNganHang, lichSu } = require('../services/nguPhapLuyen');
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

const langCua = (v) => (v === 'zh' ? 'zh' : 'en');

/** Ngân hàng câu của kiểm tra tổng hợp: bao nhiêu câu, phủ bao nhiêu chủ điểm. Không gọi AI. */
router.get('/tong-hop', async (req, res, next) => {
    try {
        res.json({ success: true, data: await thongKeNganHang(langCua(req.query.lang)) });
    } catch (err) { next(err); }
});

/** Mở một lượt kiểm tra tổng hợp từ câu đã lưu. Không gọi AI. */
router.post('/tong-hop', async (req, res, next) => {
    try {
        const r = await moTongHop(req.user.id, langCua(req.body?.lang));
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

/** AI soạn thêm câu cho ngân hàng (một chủ điểm). Tốn một lượt AI. */
router.post('/tong-hop/mo-rong', async (req, res, next) => {
    try {
        const mucId = typeof req.body?.mucId === 'string' ? req.body.mucId : '';
        const r = await moRongNganHang(req.user.id, langCua(req.body?.lang), mucId);
        if (r.loi) return res.status(r.ma || 400).json({ success: false, message: r.loi });
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

/** Lịch sử câu đã làm, từng trang. */
router.get('/lich-su', async (req, res, next) => {
    try {
        const truoc = typeof req.query.truoc === 'string' ? req.query.truoc.slice(0, 40) : '';
        res.json({ success: true, data: await lichSu(req.user.id, { lang: langCua(req.query.lang), truoc, chiSai: req.query.chiSai === '1' }) });
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
