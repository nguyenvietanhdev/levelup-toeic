const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getSystemMetrics, getUserGrowth } = require('../controllers/adminMetricsController');

router.get('/metrics', protect, authorize('admin'), getSystemMetrics);
router.get('/stats/growth', protect, authorize('admin'), getUserGrowth);

module.exports = router;
