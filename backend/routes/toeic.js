const express = require('express');
const router = express.Router();
const cacheMiddleware = require('../middleware/cache');

// Question bank CRUD + AI gen (split out of toeicController, P4)
const {
    getQuestions,
    getQuestion,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    deleteAllQuestions,
    getQuestionsStatistics,
    getQuestionSources,
    checkQuestionsHealth,
    getPrompts,
    savePrompt,
    resetPrompt,
    createQuestionGroup,
    generateQuestionsWithAI,
} = require('../controllers/toeicQuestionsController');

// Test (exam paper) CRUD (split out of toeicController, P4)
const {
    getTests,
    getTest,
    createTest,
    updateTest,
    publishTest,
    syncAllTests,
    refillTest,
    generateFullTest,
    deleteTest,
    deleteAllTests,
} = require('../controllers/toeicTestsController');

const {

    // Attempts
    startAttempt,
    submitAnswer,
    pauseAttempt,
    resumeAttempt,
    submitAttempt,
    getAttemptReview,

    // Analytics
    getInProgressAttempt,
    getMyAttempts,

    // Upload
    uploadPart1Image,
    uploadAudio,

} = require('../controllers/toeicController');

// Analytics (split out of toeicController, P4)
const {
    getAnalyticsOverview,
    getScoreProgress,
    getPartAnalysis,
    getSpeedAnalysis,
    getScorePrediction,
} = require('../controllers/toeicAnalyticsController');

// Admin practice-history / users-list (split out of toeicController, P4)
const {
    getAllPracticeHistory,
    getUsersList,
    deletePracticeHistory,
    deleteAllUserHistory,
    deleteAllHistory,
} = require('../controllers/toeicHistoryController');

const { protect, authorize } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');
// Bản MEMORY: controller tự đẩy Cloudinary (nếu có env) hoặc ghi đĩa (fallback).
const { uploadImageMem: uploadImage, uploadAudioMem: uploadAudioMiddleware } = require('../middleware/upload');

// ===================================
// PUBLIC ROUTES (if any)
// ===================================
// None for now - all TOEIC routes require authentication

// ===================================
// PROTECTED ROUTES (User)
// ===================================
router.use(protect);

/**
 * @swagger
 * /api/toeic/tests:
 *   get:
 *     tags: [TOEIC Test]
 *     summary: Danh sách đề thi đã publish
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: testType
 *         schema: { type: string, enum: [full-test, mini-part1, mini-part2, mini-part3, mini-part4, mini-part5, mini-part6, mini-part7, listening, reading] }
 *       - in: query
 *         name: level
 *         schema: { type: string, enum: [beginner, intermediate, advanced] }
 *     responses:
 *       200:
 *         description: Danh sách đề thi
 */
router.get('/tests', cacheMiddleware(300), getTests);

/**
 * @swagger
 * /api/toeic/tests/{id}:
 *   get:
 *     tags: [TOEIC Test]
 *     summary: Chi tiết một đề thi
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết đề thi
 *       404:
 *         description: Không tìm thấy
 */
router.get('/tests/:id', cacheMiddleware(300), getTest);

/**
 * @swagger
 * /api/toeic/attempts/start:
 *   post:
 *     tags: [TOEIC Test]
 *     summary: Bắt đầu làm đề thi
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [testId]
 *             properties:
 *               testId: { type: string }
 *     responses:
 *       200:
 *         description: Attempt đã tạo, trả về attempt ID và câu hỏi
 *       409:
 *         description: Đang có bài thi chưa hoàn thành
 */
// Chưa mở feature:toeic thì KHÔNG bắt đầu bài (chặn ở start là đủ — không có
// attempt thì answer/submit/thưởng cũng không chạy được).
router.post('/attempts/start', requireLevel('feature:toeic'), startAttempt);

/**
 * @swagger
 * /api/toeic/attempts/{id}/answer:
 *   put:
 *     tags: [TOEIC Test]
 *     summary: Lưu đáp án cho một câu hỏi
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Attempt ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [questionId, answer]
 *             properties:
 *               questionId: { type: string }
 *               answer:     { type: string, enum: [A, B, C, D] }
 *               timeSpent:  { type: integer, description: Giây }
 *     responses:
 *       200:
 *         description: Đáp án đã lưu
 */
router.put('/attempts/:id/answer', submitAnswer);

/**
 * @swagger
 * /api/toeic/attempts/{id}/pause:
 *   put:
 *     tags: [TOEIC Test]
 *     summary: Tạm dừng bài thi (lưu trạng thái)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Đã tạm dừng
 */
router.put('/attempts/:id/pause', pauseAttempt);

/**
 * @swagger
 * /api/toeic/attempts/{id}/resume:
 *   put:
 *     tags: [TOEIC Test]
 *     summary: Tiếp tục bài thi đã tạm dừng
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Trạng thái bài thi hiện tại
 */
router.put('/attempts/:id/resume', resumeAttempt);

/**
 * @swagger
 * /api/toeic/attempts/{id}/submit:
 *   post:
 *     tags: [TOEIC Test]
 *     summary: Nộp bài thi
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Kết quả thi (scaled score 10-990, phân tích từng Part)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:    { type: boolean }
 *                 totalScore: { type: integer, example: 750, description: Scaled score 10-990 }
 *                 partScores:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       partNumber:     { type: integer }
 *                       correctAnswers: { type: integer }
 *                       totalQuestions: { type: integer }
 *                       accuracy:       { type: number }
 */
router.post('/attempts/:id/submit', submitAttempt);

/**
 * @swagger
 * /api/toeic/attempts/{id}/review:
 *   get:
 *     tags: [TOEIC Test]
 *     summary: Xem lại bài thi (đáp án đúng/sai, giải thích)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết từng câu hỏi và đáp án
 */
router.get('/attempts/:id/review', getAttemptReview);

/**
 * @swagger
 * /api/toeic/my-attempts/in-progress:
 *   get:
 *     tags: [TOEIC Test]
 *     summary: Lấy bài thi đang làm dở (nếu có)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Attempt đang in-progress hoặc null
 */
router.get('/my-attempts/in-progress', getInProgressAttempt);

/**
 * @swagger
 * /api/toeic/my-attempts:
 *   get:
 *     tags: [TOEIC Test]
 *     summary: Lịch sử các lần thi của user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách lịch sử thi
 */
router.get('/my-attempts', getMyAttempts);

/**
 * @swagger
 * /api/toeic/analytics/overview:
 *   get:
 *     tags: [TOEIC Test]
 *     summary: Tổng quan analytics (điểm TB, accuracy, số lần thi...)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overview analytics
 */
router.get('/analytics/overview', getAnalyticsOverview);

/**
 * @swagger
 * /api/toeic/analytics/progress:
 *   get:
 *     tags: [TOEIC Test]
 *     summary: Biểu đồ tiến độ điểm theo thời gian
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dữ liệu biểu đồ điểm
 */
router.get('/analytics/progress', getScoreProgress);

/**
 * @swagger
 * /api/toeic/analytics/parts:
 *   get:
 *     tags: [TOEIC Test]
 *     summary: Phân tích accuracy theo từng Part (1-7)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Accuracy từng Part
 */
router.get('/analytics/parts', getPartAnalysis);
router.get('/analytics/speed', getSpeedAnalysis);

/**
 * @swagger
 * /api/toeic/analytics/prediction:
 *   get:
 *     tags: [TOEIC Analytics]
 *     summary: Ước lượng điểm nếu đi thi thật + đối chiếu mục tiêu đã đặt
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Khoảng điểm dự đoán, mức tin cậy, khoảng cách tới mục tiêu
 */
router.get('/analytics/prediction', getScorePrediction);

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/toeic/questions:
 *   get:
 *     tags: [TOEIC Test]
 *     summary: Lấy toàn bộ ngân hàng câu hỏi (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: part
 *         schema: { type: integer, minimum: 1, maximum: 7 }
 *     responses:
 *       200:
 *         description: Danh sách câu hỏi
 *   post:
 *     tags: [TOEIC Test]
 *     summary: Tạo câu hỏi mới (Admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Câu hỏi đã tạo
 */
router.get('/questions/statistics', authorize('admin'), getQuestionsStatistics);
router.get('/questions/sources', authorize('admin'), getQuestionSources);
// Soi ngân hàng câu hỏi: số trùng / lọt dải Part / thiếu media. Chỉ báo, không sửa.
router.get('/questions/health', authorize('admin'), checkQuestionsHealth);

// Prompt AI sinh câu hỏi — admin sửa được, lưu DB (xoá = về mặc định trong code).
router.get('/prompts', authorize('admin'), getPrompts);
router.put('/prompts/:key', authorize('admin'), savePrompt);
router.delete('/prompts/:key', authorize('admin'), resetPrompt);
router.get('/questions', authorize('admin'), getQuestions);
router.get('/questions/:id', authorize('admin'), getQuestion);
router.post('/questions/group', authorize('admin'), createQuestionGroup);
router.post('/questions', authorize('admin'), createQuestion);
router.post('/questions/ai-generate', authorize('admin'), generateQuestionsWithAI);
router.put('/questions/:id', authorize('admin'), updateQuestion);
router.delete('/questions/delete-all', authorize('admin'), deleteAllQuestions);
router.delete('/questions/:id', authorize('admin'), deleteQuestion);

/**
 * @swagger
 * /api/toeic/tests:
 *   post:
 *     tags: [TOEIC Test]
 *     summary: Tạo đề thi mới (Admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Đề thi đã tạo
 */
router.post('/tests', authorize('admin'), createTest);
router.put('/tests/:id', authorize('admin'), updateTest);
router.put('/tests/:id/publish', authorize('admin'), publishTest);
router.post('/tests/generate', authorize('admin'), generateFullTest);
// Đồng bộ lại số câu của mọi đề + dọn ref trỏ vào màn hỏi đã xoá.
router.post('/tests/sync-all', authorize('admin'), syncAllTests);
// Nạp thêm vào đề những màn mới có trong kho (cùng source + part).
router.post('/tests/:id/refill', authorize('admin'), refillTest);
router.delete('/tests/delete-all', authorize('admin'), deleteAllTests);
router.delete('/tests/:id', authorize('admin'), deleteTest);

router.post('/upload/part1-image', authorize('admin'), uploadImage.single('image'), uploadPart1Image);
router.post('/upload/audio', authorize('admin'), uploadAudioMiddleware.single('audio'), uploadAudio);

// ── Bộ đáp án của đề (nhập dạng JSON, server không gọi AI) ──────────────────
const answerKeyCtrl = require('../controllers/answerKeyController');
router.get('/answer-keys', authorize('admin'), answerKeyCtrl.listAnswerKeys);
router.post('/answer-keys/import', authorize('admin'), answerKeyCtrl.importAnswerKey);
router.get('/answer-keys/:source/compare', authorize('admin'), answerKeyCtrl.compareAnswerKey);
router.post('/answer-keys/:source/apply', authorize('admin'), answerKeyCtrl.applyAnswerKey);
router.delete('/answer-keys/:source', authorize('admin'), answerKeyCtrl.deleteAnswerKey);

router.get('/admin/practice-history', authorize('admin'), getAllPracticeHistory);
router.get('/admin/users-list', authorize('admin'), getUsersList);
router.delete('/admin/practice-history/all', authorize('admin'), deleteAllHistory);
router.delete('/admin/practice-history/:id', authorize('admin'), deletePracticeHistory);
router.delete('/admin/practice-history/user/:userId', authorize('admin'), deleteAllUserHistory);

module.exports = router;
