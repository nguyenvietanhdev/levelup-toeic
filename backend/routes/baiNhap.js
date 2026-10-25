// ===================================
// BÀI LÀM DỞ (Viết / Dịch) — đề đã lấy + phần đã gõ, để vào lại làm tiếp
// ===================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const UserProfile = require('../models/UserProfile');
const { layNhap, luuNoiDung, xoaNhap, MODES } = require('../services/baiNhap');

router.use(protect);

/** Ngôn ngữ đang học — bài nháp tách theo ngôn ngữ như mọi dữ liệu học khác. */
async function langCua(userId) {
    const p = await UserProfile.findOne({ userId }).select('settings').lean();
    return p?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
}

router.param('mode', (req, res, next, mode) => {
    if (!MODES.includes(mode)) return res.status(400).json({ success: false, message: 'Chế độ không hợp lệ' });
    next();
});

/** Bài làm dở (null nếu không có). */
router.get('/:mode', async (req, res, next) => {
    try {
        res.json({ success: true, data: await layNhap(req.user.id, req.params.mode, await langCua(req.user.id)) });
    } catch (err) { next(err); }
});

/** Tự lưu phần đã gõ. Chỉ cập nhật bài nháp đang có — client không tự đặt đề được. */
router.put('/:mode', async (req, res, next) => {
    try {
        const co = await luuNoiDung(
            req.user.id, req.params.mode, await langCua(req.user.id), req.body?.noiDung, req.body?.deBai,
        );
        res.json({ success: true, data: { daLuu: co } });
    } catch (err) { next(err); }
});

/** Bỏ bài làm dở. */
router.delete('/:mode', async (req, res, next) => {
    try {
        await xoaNhap(req.user.id, req.params.mode, await langCua(req.user.id));
        res.json({ success: true, data: { daXoa: true } });
    } catch (err) { next(err); }
});

module.exports = router;
