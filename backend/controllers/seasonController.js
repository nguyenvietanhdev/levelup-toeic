const Season = require('../models/Season');
const SeasonHallOfFame = require('../models/SeasonHallOfFame');
const { runSeasonReset } = require('../services/seasonService');

// GET /api/season/current — public, phục vụ đồng hồ đếm ngược
exports.getCurrent = async (req, res, next) => {
    try {
        const s = await Season.getCurrent();
        res.json({
            success: true,
            data: {
                seasonNumber: s.seasonNumber,
                startAt: s.startAt,
                endAt: s.endAt,
                status: s.status,
                serverNow: new Date(),
            },
        });
    } catch (e) { next(e); }
};

// GET /api/season/config — admin (đầy đủ)
exports.getConfig = async (req, res, next) => {
    try {
        const s = await Season.getCurrent();
        res.json({ success: true, data: s });
    } catch (e) { next(e); }
};

// PUT /api/season/config — admin: đặt thời gian bắt đầu/kết thúc + nhóm reset
exports.updateConfig = async (req, res, next) => {
    try {
        const { startAt, endAt, resetBuckets } = req.body;
        const s = await Season.getCurrent();

        if (startAt) s.startAt = new Date(startAt);
        if (endAt) s.endAt = new Date(endAt);
        if (resetBuckets && typeof resetBuckets === 'object') {
            const cur = s.resetBuckets?.toObject ? s.resetBuckets.toObject() : { ...s.resetBuckets };
            s.resetBuckets = { ...cur, ...resetBuckets };
        }

        if (new Date(s.endAt) <= new Date(s.startAt)) {
            return res.status(400).json({ success: false, message: 'Thời gian kết thúc phải sau thời gian bắt đầu' });
        }
        await s.save();
        res.json({ success: true, message: 'Đã lưu cấu hình mùa', data: s });
    } catch (e) { next(e); }
};

// POST /api/season/reset — admin: reset thủ công ngay
exports.resetNow = async (req, res, next) => {
    try {
        const next_ = await runSeasonReset('manual');
        res.json({ success: true, message: `Đã reset. Bắt đầu mùa ${next_.seasonNumber}.`, data: next_ });
    } catch (e) { next(e); }
};

// GET /api/season/hall-of-fame — public: danh sách bảng vinh danh các mùa
exports.getHallOfFame = async (req, res, next) => {
    try {
        const list = await SeasonHallOfFame.find({}).sort({ seasonNumber: -1 }).limit(20).lean();
        res.json({ success: true, data: list });
    } catch (e) { next(e); }
};

/**
 * Hành trình các mùa của CHÍNH user (tab Hồ sơ).
 * GET /api/season/my-history
 */
exports.getMySeasonHistory = async (req, res, next) => {
    try {
        const UserSeasonRecord = require('../models/UserSeasonRecord');
        const data = await UserSeasonRecord.find({ userId: req.user.id })
            .sort({ seasonNumber: -1 })
            .limit(24)
            .lean();
        res.json({ success: true, data });
    } catch (err) { next(err); }
};
