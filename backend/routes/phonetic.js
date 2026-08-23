// ===================================
// PHONETIC ROUTES — phiên âm câu ví dụ (IPA / pinyin)
// ===================================

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/phoneticController');
const { protect } = require('../middleware/auth');

// Cần đăng nhập: mỗi lần chưa có cache là một request tính tiền theo token.
// KHÔNG khoá theo Level — đây là thông tin phụ trợ của bài học, không phải một
// tính năng riêng để mở khoá.
router.use(protect);

router.get('/sentence', ctrl.sentence);

module.exports = router;
