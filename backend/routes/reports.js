const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/reportController');

// User: submit a report (optional auth — logged-in users get username stored)
router.post('/', protect, ...ctrl.submitReport);
router.post('/guest', ...ctrl.submitReport); // unauthenticated fallback

// Admin: manage reports
router.get('/',              protect, authorize('admin'), ctrl.listReports);
router.get('/stats',         protect, authorize('admin'), ctrl.reportStats);
router.delete('/all',        protect, authorize('admin'), ctrl.deleteAllReports);
router.put('/:id',           protect, authorize('admin'), ctrl.updateReport);
router.delete('/:id',        protect, authorize('admin'), ctrl.deleteReport);

module.exports = router;
