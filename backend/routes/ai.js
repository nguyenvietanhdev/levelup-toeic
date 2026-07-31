// ===================================
// AI ROUTES
// ===================================

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { protect, authorize } = require('../middleware/auth');

// ===================================
// AI ROUTES — TẤT CẢ ĐỀU CẦN ĐĂNG NHẬP
// ===================================
// Trước đây cả 6 route để trần (file này còn không import middleware/auth).
// Đây không phải rủi ro dữ liệu mà là HOÁ ĐƠN: mỗi request gọi thẳng nhà cung
// cấp AI tính tiền theo token, không giới hạn, không rate limit. Client React
// đã gắn Bearer sẵn khi có phiên (api/http.js:37-39) nên thêm `protect` không
// đổi gì với người đã đăng nhập.

// Tính năng của người dùng — cần đăng nhập.
router.post('/explain', protect, aiController.explainWord);
router.post('/generate-questions', protect, aiController.generateQuestions);
router.post('/check-grammar', protect, aiController.checkGrammar);
router.post('/translate', protect, aiController.translateSentence);
router.post('/chat', protect, aiController.chatWithTutor);

// Chỉ admin: tra từ để tự điền form vật phẩm/từ vựng trong dashboard.
// Caller duy nhất là admin panel (features/users/users.js).
router.post('/lookup-word', protect, authorize('admin'), aiController.lookupWord);

module.exports = router;