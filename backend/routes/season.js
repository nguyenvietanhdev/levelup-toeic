const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const c = require('../controllers/seasonController');

const admin = [protect, authorize('admin')];

// Public — đồng hồ đếm ngược + bảng vinh danh
router.get('/current', c.getCurrent);
router.get('/hall-of-fame', c.getHallOfFame);

// Hành trình các mùa của chính user (hiện ở tab Hồ sơ).
router.get('/my-history', protect, c.getMySeasonHistory);

// Admin — cấu hình & reset
router.get('/config', admin, c.getConfig);
router.put('/config', admin, c.updateConfig);
router.post('/reset', admin, c.resetNow);

module.exports = router;
