// ===================================
// READING ROUTES — luyện đọc hiểu dạng TOEIC Part 7
// ===================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/readingController');
const { protect } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');

// Tất cả đều cần đăng nhập: bài làm thuộc về một người dùng cụ thể, và mỗi lần
// sinh đề là một request tính tiền theo token — để trần là hoá đơn không giới hạn.
router.use(protect);

// Khoá theo Level ở SERVER, không chỉ ẩn thẻ ở trang chủ. Giao diện chỉ là giao
// diện; gọi thẳng API là lách được, mà "lách" ở đây nghĩa là người chưa đủ Level
// vẫn tiêu token của ta.
router.post('/passage', requireLevel('feature:reading'), ctrl.passage);
router.post('/grade', requireLevel('feature:reading'), ctrl.grade);

// `history` KHÔNG khoá: người vừa tụt Level vẫn phải xem lại được bài mình đã
// làm — đó là dữ liệu của họ.
router.get('/history', ctrl.history);

module.exports = router;
