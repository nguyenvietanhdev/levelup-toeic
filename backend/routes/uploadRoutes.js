const express = require('express');
const router = express.Router();
const {
  checkPermission,
  uploadVocabulary,
  getMyTopics,
  getExpiringTopics,
  getMyVocabulary,
  deleteMyWord,
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
router.post('/extend/:source', protect, extendMySource);
router.delete('/my-source/:source', protect, deleteMySource);

// Admin routes
router.get('/admin/monitoring', protect, authorize('admin'), getMonitoring);
router.get('/admin/stats', protect, authorize('admin'), getStats);

module.exports = router;
