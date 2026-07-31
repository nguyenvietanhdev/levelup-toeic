const express = require('express');
const router = express.Router();
const FeatureUnlock = require('../models/FeatureUnlock');
const UserProfile = require('../models/UserProfile');
const { protect } = require('../middleware/auth');

/**
 * GET /api/features/unlocks — mốc mở khoá + level hiện tại của user.
 * Client dùng để vẽ ổ khoá "Mở ở Level X" (server vẫn là chốt chặn thật).
 */
router.get('/unlocks', protect, async (req, res, next) => {
    try {
        const [list, profile] = await Promise.all([
            FeatureUnlock.find({ isActive: true }).sort({ order: 1 }).select('key label requiredLevel icon description').lean(),
            UserProfile.findOne({ userId: req.user.id }).select('level').lean(),
        ]);
        const level = profile?.level || 1;
        // Ngoại lệ: coi như đã mở hết — UI không vẽ ổ khoá (server cũng cho qua).
        const bypass = req.user?.bypassFeatureLock === true;
        res.json({
            success: true,
            data: {
                level,
                bypass,
                unlocks: list.map(u => ({ ...u, unlocked: bypass || level >= u.requiredLevel })),
            },
        });
    } catch (err) { next(err); }
});

module.exports = router;
