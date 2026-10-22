// ===================================
// ROLES ROUTES — vai của AI theo Part (hội thoại và các chế độ AI khác)
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const roles = require('../services/aiRoles');

// Vai gắn với người học và đề họ đang học, nên phải đăng nhập.
router.use(protect);

/** Vai đang áp dụng cho Part này (vai riêng nếu có, không thì vai AI). */
router.get('/', async (req, res, next) => {
    try {
        const data = await roles.layVai({
            userId: req.user.id,
            email: req.user.email,
            source: req.query.source,
            part: req.query.part,
            lang: req.query.lang,
        });
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

/** Danh sách mọi vai của Part: vai riêng + các vai AI đã lưu (để sửa, xoá, chọn dùng). */
router.get('/list', async (req, res, next) => {
    try {
        const data = await roles.danhSachVai({
            userId: req.user.id,
            email: req.user.email,
            source: req.query.source,
            part: req.query.part,
            lang: req.query.lang,
        });
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

/** Nhờ AI đề xuất vai cho Part. Đã có thì trả lại, không gọi AI. */
/** Lưu MỘT vai AI đã được người học xem (bản nháp từ /suggest). Trùng thì không lưu thêm. */
router.post('/save-ai', async (req, res, next) => {
    try {
        const data = await roles.luuVaiAI({
            email: req.user.email,
            source: req.body.source,
            part: req.body.part,
            lang: req.body.lang,
            title: req.body.title,
            text: req.body.text,
        });
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

/** Đề xuất một bản nháp vai (KHÔNG lưu). Người học bấm "Lưu vai AI" để lưu. */
router.post('/suggest', async (req, res, next) => {
    try {
        const data = await roles.deXuatVaiAI({
            userId: req.user.id,
            email: req.user.email,
            source: req.body.source,
            part: req.body.part,
            lang: req.body.lang,
        });
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

/** Người dùng tự viết vai cho Part (thay vai AI với riêng người này). */
router.put('/mine', async (req, res, next) => {
    try {
        const data = await roles.luuVaiNguoiDung({
            userId: req.user.id,
            email: req.user.email,
            source: req.body.source,
            part: req.body.part,
            lang: req.body.lang,
            title: req.body.title,
            text: req.body.text,
        });
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

/** Xoá vai riêng; sau đó người này quay về vai AI của Part (nếu có). */
router.delete('/mine', async (req, res, next) => {
    try {
        const data = await roles.xoaVaiNguoiDung({
            userId: req.user.id,
            source: req.query.source,
            part: req.query.part,
            lang: req.query.lang,
        });
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

module.exports = router;
