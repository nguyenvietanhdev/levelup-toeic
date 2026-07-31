const express = require('express');
const router = express.Router();

const {
    startSession, submitSession, getHistory,
    getSessionById, getStats, getRecentSessions,
    adminGetHistory, adminGetUsersList, adminDeleteSession,
    getModePercentile,
} = require('../controllers/practiceController');

const { protect, authorize } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');

router.use(protect);

/**
 * @swagger
 * /api/practice/start:
 *   post:
 *     tags: [Practice]
 *     summary: Bắt đầu phiên luyện tập
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PracticeStartRequest'
 *     responses:
 *       200:
 *         description: Phiên luyện tập đã tạo, trả về danh sách câu hỏi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:   { type: boolean }
 *                 sessionId: { type: string }
 *                 mode:      { type: string }
 *                 questions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VocabularyItem'
 */
router.post('/start', requireLevel(req => (req.body?.mode ? `mode:${req.body.mode}` : null)), startSession);

/**
 * @swagger
 * /api/practice/submit:
 *   post:
 *     tags: [Practice]
 *     summary: Nộp kết quả phiên luyện tập
 *     description: Lưu kết quả, tính XP/coins, cập nhật streak và game state.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PracticeSubmitRequest'
 *     responses:
 *       200:
 *         description: Kết quả đã lưu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:      { type: boolean }
 *                 score:        { type: number }
 *                 xpEarned:     { type: integer }
 *                 coinsEarned:  { type: integer }
 *                 isPerfect:    { type: boolean }
 *                 newLevel:     { type: integer, nullable: true }
 */
router.post('/submit', submitSession);

/**
 * @swagger
 * /api/practice/history:
 *   get:
 *     tags: [Practice]
 *     summary: Lịch sử luyện tập của user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: mode
 *         schema: { type: string }
 *         description: Lọc theo chế độ luyện tập
 *     responses:
 *       200:
 *         description: Lịch sử luyện tập
 */
router.get('/history', getHistory);

/**
 * @swagger
 * /api/practice/stats:
 *   get:
 *     tags: [Practice]
 *     summary: Thống kê tổng hợp của user (accuracy, streak, mode breakdown...)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê luyện tập
 */
router.get('/stats', getStats);

// Xếp hạng độ chính xác của user trong 1 chế độ so với toàn server.
router.get('/percentile/:mode', getModePercentile);

/**
 * @swagger
 * /api/practice/recent:
 *   get:
 *     tags: [Practice]
 *     summary: 5 phiên luyện tập gần nhất
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách phiên gần nhất
 */
router.get('/recent', getRecentSessions);

/**
 * @swagger
 * /api/practice/session/{id}:
 *   get:
 *     tags: [Practice]
 *     summary: Chi tiết một phiên luyện tập (đáp án, thời gian từng câu...)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết phiên luyện tập
 *       404:
 *         description: Không tìm thấy
 */
router.get('/session/:id', getSessionById);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get('/admin/history',       authorize('admin'), adminGetHistory);
router.get('/admin/users-list',    authorize('admin'), adminGetUsersList);
router.delete('/admin/session/:id', authorize('admin'), adminDeleteSession);

module.exports = router;
