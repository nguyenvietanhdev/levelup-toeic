// ===================================
// LISTENING ROUTES — Nghe với AI (TTS)
// ===================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/listeningController');
const { protect } = require('../middleware/auth');

// Âm thanh không cần đăng nhập: <audio> không gửi được token, và id là ngẫu nhiên.
// Âm thanh chỉ phát đoạn đọc, không trả chữ.
router.get('/:id/audio', ctrl.audio);

// Mở lượt nghe và chấm: cần đăng nhập vì trừ năng lượng và cộng thưởng.
router.post('/start', protect, ctrl.start);
router.post('/:id/grade', protect, ctrl.grade);

// Lịch sử: chỉ lượt đã chấm. `/history` đặt TRƯỚC `/:id`.
router.get('/history', protect, ctrl.history);
router.get('/:id', protect, ctrl.detail);

module.exports = router;
