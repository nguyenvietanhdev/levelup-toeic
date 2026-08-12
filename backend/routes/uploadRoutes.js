const express = require('express');
const router = express.Router();
const {
  checkPermission,
  uploadVocabulary,
  getMyTopics,
  getExpiringTopics,
  getMyVocabulary,
  deleteMyWord,
  updateMyWord,
  shareSource,
  unshareSource,
  listSharees,
  getSharedTopics,
  getSharedVocabulary,
  copySharedSource,
  deleteMySource,
  extendMySource,
  getMonitoring,
  getStats,
} = require('../controllers/uploadController');
const { protect, authorize } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');
const validate = require('../middleware/validate');
const { vocabUpload } = require('../validators/schemas');

// User routes
router.get('/check', protect, checkPermission);
router.post('/vocabulary', protect, requireLevel('feature:upload-vocab'), validate(vocabUpload), uploadVocabulary);
router.get('/my-topics', protect, getMyTopics);
router.get('/expiring', protect, getExpiringTopics);
router.get('/my-vocabulary/:source', protect, getMyVocabulary);
router.delete('/my-vocabulary/:wordId', protect, deleteMyWord);
// Sửa từ: cùng quyền với xoá (protect + lọc theo ownerEmail trong controller).
router.put('/my-vocabulary/:wordId', protect, updateMyWord);

// Chia sẻ bộ từ cho tài khoản khác. Tất cả đều `protect`: quyền sở hữu được
// kiểm bên trong handler bằng `ownerEmail: req.user.email`, không có middleware
// riêng cho từng tài nguyên (repo này chưa có mô hình đó).
router.post('/share/:source', protect, shareSource);
router.delete('/share/:source/:granteeId', protect, unshareSource);
router.get('/share/:source', protect, listSharees);

// Đường đọc của NGƯỜI ĐƯỢC chia sẻ. Route riêng chứ không nới getMyVocabulary:
// 9 handler kia đang cùng một khuôn `ownerEmail: <người gọi>`, làm một cái thành
// có điều kiện là người viết handler thứ 10 chép nhầm khuôn.
router.get('/shared-topics', protect, getSharedTopics);
router.get('/shared-vocabulary/:ownerEmail/:source', protect, getSharedVocabulary);
router.post('/shared-vocabulary/:ownerEmail/:source/copy', protect, copySharedSource);
router.post('/extend/:source', protect, extendMySource);
router.delete('/my-source/:source', protect, deleteMySource);

// Admin routes
router.get('/admin/monitoring', protect, authorize('admin'), getMonitoring);
router.get('/admin/stats', protect, authorize('admin'), getStats);

module.exports = router;
