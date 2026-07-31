const express = require('express');
const router = express.Router();
const {
    getTopics,
    getAllTopics,
    createTopic,
    updateTopic,
    publishTopic,
    deleteTopic,
    syncWordCount,
    syncAllWordCounts,
} = require('../controllers/topicController');
const { protect, authorize } = require('../middleware/auth');
const admin = [protect, authorize('admin')];

router.get('/', getTopics);
router.get('/all', ...admin, getAllTopics);
router.post('/sync-all', ...admin, syncAllWordCounts);
router.post('/', ...admin, createTopic);
router.put('/:id', ...admin, updateTopic);
router.put('/:id/publish', ...admin, publishTopic);
router.delete('/:id', ...admin, deleteTopic);
router.post('/:id/sync-count', ...admin, syncWordCount);

module.exports = router;
