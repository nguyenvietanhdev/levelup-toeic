const express = require('express');
const router = express.Router();
const {
    getActivities,
    clearActivities
} = require('../controllers/activityController');

// GET /api/activities - Get activity logs
router.get('/', getActivities);

// DELETE /api/activities - Clear all activity logs
router.delete('/', clearActivities);

module.exports = router;
