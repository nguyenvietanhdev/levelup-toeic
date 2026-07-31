const express = require('express');
const router = express.Router();

const {
    getAllVocabulary, getVocabularyById, getRandomVocabulary, getVocabularyByPart,
    searchVocabulary, createVocabulary, updateVocabulary, deleteVocabulary,
    getVocabularyStats, getVocabularyParts, bulkImportVocabulary,
    replaceVocabulary, upsertVocabulary,
    bulkDeleteVocabulary, filterDeleteVocabulary, deleteAllVocabulary,
} = require('../controllers/vocabularyController');
const {
    getAvailableFiles, switchVocabularyFile, getVocabularySources,
} = require('../controllers/vocabularyDatasetsController');
const { scanDuplicates, removeDuplicates } = require('../controllers/vocabularyDedupController');
const { getFavorites, addFavorite, removeFavorite } = require('../controllers/favoritesController');
const { requireLevel } = require('../services/featureUnlock');
const { protect } = require('../middleware/auth');

/**
 * @swagger
 * /api/vocabulary:
 *   get:
 *     tags: [Vocabulary]
 *     summary: Lấy danh sách từ vựng (có phân trang & lọc)
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: part
 *         schema: { type: string }
 *         description: Lọc theo part (e.g. ETS24T10-P5)
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [noun, verb, adjective, adverb] }
 *       - in: query
 *         name: difficulty
 *         schema: { type: string, enum: [easy, medium, hard] }
 *     responses:
 *       200:
 *         description: Danh sách từ vựng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VocabularyListResponse'
 */
router.get('/', getAllVocabulary);

/**
 * @swagger
 * /api/vocabulary/stats:
 *   get:
 *     tags: [Vocabulary]
 *     summary: Thống kê từ vựng (tổng số, phân bổ theo part/type/difficulty)
 *     security: []
 *     responses:
 *       200:
 *         description: Thống kê
 */
router.get('/stats', getVocabularyStats);

/**
 * @swagger
 * /api/vocabulary/sources:
 *   get:
 *     tags: [Vocabulary]
 *     summary: Danh sách các bộ từ vựng (Chọn đề luyện tập)
 *     security: []
 *     responses:
 *       200:
 *         description: Danh sách sources với số lượng từ
 */
router.get('/sources', getVocabularySources);

/**
 * @swagger
 * /api/vocabulary/parts:
 *   get:
 *     tags: [Vocabulary]
 *     summary: Lấy danh sách các part có sẵn
 *     security: []
 *     responses:
 *       200:
 *         description: Mảng tên các part
 */
router.get('/parts', getVocabularyParts);

/**
 * @swagger
 * /api/vocabulary/search:
 *   get:
 *     tags: [Vocabulary]
 *     summary: Tìm kiếm từ vựng
 *     security: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Từ khoá tìm kiếm (tiếng Anh hoặc tiếng Việt)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Kết quả tìm kiếm
 */
router.get('/search', searchVocabulary);

/**
 * @swagger
 * /api/vocabulary/files:
 *   get:
 *     tags: [Vocabulary]
 *     summary: Liệt kê các file từ vựng JSON có sẵn
 *     security: []
 *     responses:
 *       200:
 *         description: Danh sách file (vocabulary.json, ets.json, ETS2024.json...)
 */
router.get('/files', getAvailableFiles);

// Scan DB duplicates (key = source + part + en). Must be before '/:id'.
router.get('/duplicates', scanDuplicates);

/**
 * @swagger
 * /api/vocabulary/random/{count}:
 *   get:
 *     tags: [Vocabulary]
 *     summary: Lấy ngẫu nhiên N từ vựng
 *     security: []
 *     parameters:
 *       - in: path
 *         name: count
 *         required: true
 *         schema: { type: integer, example: 10 }
 *       - in: query
 *         name: part
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Mảng N từ vựng ngẫu nhiên
 */
router.get('/random/:count', getRandomVocabulary);

/**
 * @swagger
 * /api/vocabulary/part/{part}:
 *   get:
 *     tags: [Vocabulary]
 *     summary: Lấy tất cả từ vựng theo part
 *     security: []
 *     parameters:
 *       - in: path
 *         name: part
 *         required: true
 *         schema: { type: string, example: ETS24T10-P5 }
 *     responses:
 *       200:
 *         description: Danh sách từ của part đó
 */
router.get('/part/:part', getVocabularyByPart);

// Favorites routes (must be before /:id to avoid route conflict)
router.get('/favorites', protect, getFavorites);
router.post('/favorites', protect, requireLevel('feature:favorites'), addFavorite);
router.delete('/favorites', protect, requireLevel('feature:favorites'), removeFavorite);

/**
 * @swagger
 * /api/vocabulary/{id}:
 *   get:
 *     tags: [Vocabulary]
 *     summary: Lấy chi tiết một từ
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết từ vựng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VocabularyItem'
 *       404:
 *         description: Không tìm thấy
 */
router.get('/:id', getVocabularyById);

/**
 * @swagger
 * /api/vocabulary:
 *   post:
 *     tags: [Vocabulary]
 *     summary: Thêm từ mới (Admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VocabularyItem'
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
router.post('/', createVocabulary);
router.post('/upsert', upsertVocabulary);

/**
 * @swagger
 * /api/vocabulary/bulk:
 *   post:
 *     tags: [Vocabulary]
 *     summary: Import hàng loạt từ vựng (Admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               words:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/VocabularyItem'
 *     responses:
 *       200:
 *         description: Import thành công
 */
router.post('/bulk', bulkImportVocabulary);

/**
 * @swagger
 * /api/vocabulary/replace:
 *   post:
 *     tags: [Vocabulary]
 *     summary: Thay thế toàn bộ dataset (Admin)
 *     responses:
 *       200:
 *         description: Thay thế thành công
 */
router.post('/replace', replaceVocabulary);

/**
 * @swagger
 * /api/vocabulary/switch/{filename}:
 *   post:
 *     tags: [Vocabulary]
 *     summary: Chuyển sang file từ vựng khác (Admin)
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string, example: ets.json }
 *     responses:
 *       200:
 *         description: Chuyển file thành công
 */
router.post('/switch/:filename', switchVocabularyFile);

/**
 * @swagger
 * /api/vocabulary/remove-duplicates/{filename}:
 *   post:
 *     tags: [Vocabulary]
 *     summary: Xoá từ trùng lặp trong file (Admin)
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string, example: vocabulary.json }
 *     responses:
 *       200:
 *         description: Đã xoá trùng lặp
 */
router.post('/remove-duplicates/:filename', removeDuplicates);

/**
 * @swagger
 * /api/vocabulary/{id}:
 *   put:
 *     tags: [Vocabulary]
 *     summary: Cập nhật từ vựng (Admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VocabularyItem'
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     tags: [Vocabulary]
 *     summary: Xoá từ vựng (Admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Xoá thành công
 */
router.delete('/bulk', bulkDeleteVocabulary);
router.delete('/all', deleteAllVocabulary);
router.post('/filter-delete', filterDeleteVocabulary);

router.put('/:id', updateVocabulary);
router.delete('/:id', deleteVocabulary);

module.exports = router;
