const express = require('express');
const router = express.Router();
const FeatureUnlock = require('../models/FeatureUnlock');
const UserProfile = require('../models/UserProfile');
const { protect } = require('../middleware/auth');
const { lockingEnabled } = require('../services/featureUnlock');
const ModeSchedule = require('../models/ModeSchedule');
const { dangMo, moTa } = require('../services/modeSchedule');

/**
 * GET /api/features/unlocks — mốc mở khoá + level hiện tại của user.
 * Client dùng để vẽ ổ khoá "Mở ở Level X" (server vẫn là chốt chặn thật).
 */
router.get('/unlocks', protect, async (req, res, next) => {
    try {
        const [list, profile, locking] = await Promise.all([
            FeatureUnlock.find({ isActive: true }).sort({ order: 1 }).select('key label requiredLevel icon description').lean(),
            UserProfile.findOne({ userId: req.user.id }).select('level').lean(),
            lockingEnabled(),
        ]);
        const level = profile?.level || 1;
        // Ngoại lệ: coi như đã mở hết — UI không vẽ ổ khoá (server cũng cho qua).
        const bypass = req.user?.bypassFeatureLock === true;

        // Công tắc tổng tắt → trả danh sách RỖNG thay vì unlocked:true từng mốc.
        // lockInfo() bên client coi key không có trong danh sách là "không khoá",
        // nên mọi ổ khoá biến mất mà KHÔNG phải sửa dòng frontend nào. Kèm theo,
        // unlockedBetween() cũng rỗng → lên cấp không hiện popup "vừa mở khoá X",
        // đúng, vì lúc đó chẳng còn gì để mở.
        if (!locking) {
            return res.json({ success: true, data: { level, bypass, lockingEnabled: false, unlocks: [] } });
        }

        res.json({
            success: true,
            data: {
                level,
                bypass,
                lockingEnabled: true,
                unlocks: list.map(u => ({ ...u, unlocked: bypass || level >= u.requiredLevel })),
            },
        });
    } catch (err) { next(err); }
});

/**
 * GET /api/features/schedules — khung giờ của từng chế độ.
 *
 * Trả CẢ trạng thái `dangMo` tính ở server, không để client tự tính: client
 * dùng giờ máy, mà máy người dùng có thể lệch múi giờ hoặc đơn giản là sai giờ.
 * Hai bên tính khác nhau thì giao diện báo "đang mở" còn `/practice/start` từ
 * chối — người dùng không hiểu chuyện gì.
 *
 * Kèm `moTa` để client khỏi chép lại luật dựng chuỗi "T2–T6 · 18:00–22:00".
 */
router.get('/schedules', protect, async (req, res, next) => {
    try {
        const list = await ModeSchedule.find({ isActive: true })
            .select('mode label days start end').lean();

        const bypass = req.user?.bypassFeatureLock === true;

        res.json({
            success: true,
            data: {
                bypass,
                schedules: list.map(l => ({
                    mode: l.mode,
                    days: l.days || [],
                    start: l.start,
                    end: l.end,
                    moTa: moTa(l),
                    // Ngoại lệ thì luôn mở — khớp với `requireInSchedule`.
                    dangMo: bypass || dangMo(l),
                })),
            },
        });
    } catch (err) { next(err); }
});

module.exports = router;
