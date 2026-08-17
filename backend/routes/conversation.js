// ===================================
// CONVERSATION ROUTES — chế độ Hội thoại luyện từ vựng
// ===================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/conversationController');
const { protect } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');

// TẤT CẢ đều cần đăng nhập. Hai lý do, và lý do thứ hai mới là chính:
//   · phiên hội thoại thuộc về một người dùng cụ thể (thưởng XP/xu vào tài
//     khoản họ, `WrongWord` của họ quyết chọn từ nào);
//   · mỗi lượt là một request tính tiền theo token tới nhà cung cấp AI. Để trần
//     thì đó không phải rủi ro dữ liệu mà là HOÁ ĐƠN không giới hạn — đúng lỗi
//     mà routes/ai.js từng mắc.
router.use(protect);

// Khoá theo Level ở SERVER, không chỉ ẩn mục trong menu.
//
// Menu bên đã ẩn/khoá mục này, nhưng đó chỉ là giao diện — gọi thẳng API là
// lách được. Mà ở đây "lách được" nghĩa là người chưa đủ Level vẫn tiêu token
// của ta, nên phải chặn ở đúng chỗ tiền ra.
//
// CHỈ khoá `start`: `reply`/`finish` là phiên ĐANG chạy. Chặn cả hai thì người
// vừa tụt Level (admin sửa, hoặc mốc bị nâng lên) mắc kẹt giữa hội thoại — đã
// trừ năng lượng mà không chốt được để nhận thưởng.
router.post('/start', requireLevel('feature:conversation'), ctrl.start);
router.post('/:id/reply', ctrl.reply);
router.post('/:id/finish', ctrl.finish);

module.exports = router;
