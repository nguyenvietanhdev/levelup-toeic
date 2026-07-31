const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');
const { getQuests, syncProgress, claimReward, seedDefaults, resetUserQuests } = require('../controllers/questController');

// Khoá theo Level: chưa mở feature:quest thì KHÔNG lưu tiến độ / nhận thưởng.
router.get('/',                protect, getQuests);
router.post('/sync',           protect, requireLevel('feature:quest'), syncProgress);
router.post('/claim',          protect, requireLevel('feature:quest'), claimReward);
router.post('/seed',           protect, authorize('admin'), seedDefaults);
router.post('/reset-user-quests', protect, authorize('admin'), resetUserQuests);

module.exports = router;
