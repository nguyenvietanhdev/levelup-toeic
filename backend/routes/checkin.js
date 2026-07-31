const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');
const { getCheckin, claim } = require('../controllers/checkinController');

router.get('/', protect, getCheckin);
// Chưa mở feature:checkin thì không nhận thưởng điểm danh.
router.post('/claim', protect, requireLevel('feature:checkin'), claim);

module.exports = router;
