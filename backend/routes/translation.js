// ===================================
// TRANSLATION ROUTES — luyện dịch Việt → Anh/Trung, AI chấm ba trục
// ===================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/translationController');
const { protect } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');

// Tất cả đều cần đăng nhập: bài dịch thuộc về một người dùng cụ thể, và mỗi lần
// chấm là một request tính tiền theo token — để trần là hoá đơn không giới hạn.
router.use(protect);

// Khoá theo Level ở SERVER, không chỉ ẩn thẻ ở trang chủ. Giao diện chỉ là giao
// diện; gọi thẳng API là lách được, mà "lách" ở đây nghĩa là người chưa đủ
// Level vẫn tiêu token của ta.
router.post('/passage', requireLevel('feature:translation'), ctrl.passage);
router.post('/grade', requireLevel('feature:translation'), ctrl.grade);

// `history` KHÔNG khoá: người vừa tụt Level (admin sửa, hoặc mốc bị nâng) vẫn
// phải xem lại được bài mình đã làm — đó là dữ liệu của họ.
router.get('/history', ctrl.history);

module.exports = router;
