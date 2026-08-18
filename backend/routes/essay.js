// ===================================
// ESSAY ROUTES — luyện viết luận, chấm theo tiêu chí IELTS Task 2
// ===================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/essayController');
const { protect } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');

// Tất cả đều cần đăng nhập: bài viết thuộc về một người dùng cụ thể, và mỗi lần
// chấm là một request tính tiền theo token — để trần là hoá đơn không giới hạn.
router.use(protect);

// Khoá theo Level ở SERVER, không chỉ ẩn mục menu. Menu chỉ là giao diện; gọi
// thẳng API là lách được, mà "lách" ở đây nghĩa là người chưa đủ Level vẫn tiêu
// token của ta.
router.post('/prompt', requireLevel('feature:essay'), ctrl.prompt);
router.post('/grade', requireLevel('feature:essay'), ctrl.grade);

// `history` KHÔNG khoá: người vừa tụt Level (admin sửa, hoặc mốc bị nâng) vẫn
// phải xem lại được bài mình đã viết — đó là dữ liệu của họ.
router.get('/history', ctrl.history);

module.exports = router;
