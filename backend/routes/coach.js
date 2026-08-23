// ===================================
// COACH ROUTES — gợi ý luyện tập cá nhân
// ===================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/coachController');
const { protect } = require('../middleware/auth');

// Cần đăng nhập: gợi ý dựa trên tiến trình của chính người dùng.
// KHÔNG khoá theo Level và KHÔNG tốn năng lượng — đây là lớp đọc dữ liệu đã có,
// không gọi AI, và là thứ giúp người mới biết bắt đầu từ đâu.
router.use(protect);

router.get('/suggestions', ctrl.suggestions);

module.exports = router;
