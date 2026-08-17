// ===================================
// CONVERSATION ROUTES — chế độ Hội thoại luyện từ vựng
// ===================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/conversationController');
const { protect } = require('../middleware/auth');

// TẤT CẢ đều cần đăng nhập. Hai lý do, và lý do thứ hai mới là chính:
//   · phiên hội thoại thuộc về một người dùng cụ thể (thưởng XP/xu vào tài
//     khoản họ, `WrongWord` của họ quyết chọn từ nào);
//   · mỗi lượt là một request tính tiền theo token tới nhà cung cấp AI. Để trần
//     thì đó không phải rủi ro dữ liệu mà là HOÁ ĐƠN không giới hạn — đúng lỗi
//     mà routes/ai.js từng mắc.
router.use(protect);

router.post('/start', ctrl.start);
router.post('/:id/reply', ctrl.reply);
router.post('/:id/finish', ctrl.finish);

module.exports = router;
