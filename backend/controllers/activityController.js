// ===================================
// ACTIVITY LOG CONTROLLER
// ===================================

const activityLogger = require('../utils/activityLogger');

/**
 * @desc    Get activity logs
 * @route   GET /api/activities
 * @access  Public (Admin only in production)
 */
exports.getActivities = async (req, res, next) => {
    try {
        const { limit = 20, type } = req.query;

        const logs = await activityLogger.getLogs(parseInt(limit), type);

        res.json({
            success: true,
            count: logs.length,
            data: logs
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Clear all activity logs
 * @route   DELETE /api/activities
 * @access  Private/Admin
 */
exports.clearActivities = async (req, res, next) => {
    try {
        const result = await activityLogger.clearLogs();

        if (result) {
            res.json({
                success: true,
                message: 'All activity logs cleared successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to clear activity logs'
            });
        }
    } catch (error) {
        next(error);
    }
};
