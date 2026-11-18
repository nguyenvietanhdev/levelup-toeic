// ===================================
// HỌC QUA BÀI HÁT — chỉ cho các email trong BAI_HAT_EMAILS (dự án dùng riêng)
// ===================================

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect } = require('../middleware/auth');
const S = require('../services/baiHat');

router.use(protect);

const traVe = (res, r) => (r?.loi
    ? res.status(r.ma || 400).json({ success: false, message: r.loi })
    : res.json({ success: true, data: r }));

/** Menu hỏi để biết có hiện mục "Học qua bài hát" không. Không lộ danh sách email. */
router.get('/quyen', (req, res) => res.json({ success: true, data: { duocDung: S.duocDung(req.user.email) } }));

// Mọi route còn lại: ngoài danh sách thì như không tồn tại.
router.use((req, res, next) => (S.duocDung(req.user.email)
    ? next()
    : res.status(404).json({ success: false, message: 'Không tìm thấy' })));

const idHopLe = (req, res, next) => (mongoose.isValidObjectId(req.params.id)
    ? next()
    : res.status(400).json({ success: false, message: 'Id không hợp lệ' }));

router.get('/tim-loi', async (req, res, next) => {
    try {
        const tenBai = typeof req.query.tenBai === 'string' ? req.query.tenBai : '';
        const ngheSi = typeof req.query.ngheSi === 'string' ? req.query.ngheSi : '';
        traVe(res, await S.timLoi({ tenBai, ngheSi }));
    } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await S.danhSach(req.user.id) }); } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try { traVe(res, await S.themBai(req.user.id, req.body || {})); } catch (err) { next(err); }
});

router.get('/:id', idHopLe, async (req, res, next) => {
    try {
        const bai = await S.layBai(req.user.id, req.params.id);
        if (!bai) return res.status(404).json({ success: false, message: 'Không tìm thấy bài hát' });
        res.json({ success: true, data: bai });
    } catch (err) { next(err); }
});

router.patch('/:id', idHopLe, async (req, res, next) => {
    try { traVe(res, await S.capNhat(req.user.id, req.params.id, req.body || {})); } catch (err) { next(err); }
});

router.delete('/:id', idHopLe, async (req, res, next) => {
    try { traVe(res, await S.xoaBai(req.user.id, req.params.id)); } catch (err) { next(err); }
});

module.exports = router;
