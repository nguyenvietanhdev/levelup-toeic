// ===================================
// TOEIC PRACTICE-HISTORY / ADMIN CONTROLLER
// ===================================
// Split out of toeicController (P4). Self-contained admin-dashboard
// reporting over ToeicAttempt — no exam-engine helpers, no shared internal
// state. Verbatim move; behaviour unchanged. routes/toeic.js imports these
// from here now.

const ToeicAttempt = require('../models/ToeicAttempt');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');

/**
 * @desc    Get all users' practice history (Admin only)
 * @route   GET /api/toeic/admin/practice-history
 * @access  Private/Admin
 */
exports.getAllPracticeHistory = async (req, res, next) => {
    try {
        const {
            userId,
            page = 1,
            limit = 20,
            search = '',
        } = req.query;

        const query = {};

        // Filter by specific user if provided
        if (userId) {
            query.userId = userId;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get all attempts with user information
        let attempts = await ToeicAttempt.find(query)
            .populate('userId', 'username email role')
            .populate('testId', 'title type')
            .sort({ completedAt: -1 })
            .limit(parseInt(limit))
            .skip(skip)
            .lean();

        // Filter by username search if provided
        if (search) {
            attempts = attempts.filter(attempt =>
                attempt.userId &&
                attempt.userId.username &&
                attempt.userId.username.toLowerCase().includes(search.toLowerCase())
            );
        }

        const total = await ToeicAttempt.countDocuments(query);

        // Format the response data
        const formattedAttempts = attempts.map(attempt => {
            const correctAnswers = attempt.correctAnswers || 0;
            const totalQuestions = attempt.totalQuestions || 0;
            const accuracy = totalQuestions > 0 ?
                ((correctAnswers / totalQuestions) * 100).toFixed(1) : 0;

            return {
                _id: attempt._id,
                user: {
                    _id: attempt.userId?._id,
                    username: attempt.userId?.username || 'Unknown',
                    email: attempt.userId?.email || 'N/A',
                    role: attempt.userId?.role || 'user'
                },
                test: {
                    _id: attempt.testId?._id,
                    title: attempt.testId?.title || attempt.testName || 'Practice Test',
                    type: attempt.testId?.type || attempt.testType || 'practice'
                },
                scores: {
                    total: attempt.totalScore || 0,
                    listening: attempt.listeningScore || 0,
                    reading: attempt.readingScore || 0,
                    accuracy: attempt.accuracy || accuracy
                },
                stats: {
                    total: totalQuestions,
                    correct: correctAnswers,
                    incorrect: attempt.wrongAnswers || 0,
                    skipped: attempt.skippedAnswers || 0
                },
                completedAt: attempt.completedAt,
                duration: attempt.duration || 0,
                totalScore: attempt.totalScore || 0,
                listeningScore: attempt.listeningScore || 0,
                readingScore: attempt.readingScore || 0,
                accuracy: attempt.accuracy || accuracy
            };
        });

        res.json({
            success: true,
            count: formattedAttempts.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: formattedAttempts,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get list of all users for filter dropdown (Admin only)
 * @route   GET /api/toeic/admin/users-list
 * @access  Private/Admin
 */
exports.getUsersList = async (req, res, next) => {
    try {
        // Get all users who have at least one attempt
        const usersWithAttempts = await ToeicAttempt.distinct('userId');

        const users = await User.find({ _id: { $in: usersWithAttempts } })
            .select('email role')
            .lean();
        const profileMap = new Map(
            (await UserProfile.find({ userId: { $in: usersWithAttempts } }).select('userId username').lean())
                .map(p => [p.userId.toString(), p.username])
        );
        const data = users
            .map(u => ({ ...u, username: profileMap.get(u._id.toString()) || '—' }))
            .sort((a, b) => (a.username || '').localeCompare(b.username || ''));

        res.json({
            success: true,
            count: data.length,
            data,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete a single practice history entry (Admin only)
 * @route   DELETE /api/toeic/admin/practice-history/:id
 * @access  Private/Admin
 */
exports.deletePracticeHistory = async (req, res, next) => {
    try {
        const { id } = req.params;

        const attempt = await ToeicAttempt.findById(id);

        if (!attempt) {
            return res.status(404).json({
                success: false,
                message: 'Practice history not found',
            });
        }

        await ToeicAttempt.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Practice history deleted successfully',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete all practice history for a specific user (Admin only)
 * @route   DELETE /api/toeic/admin/practice-history/user/:userId
 * @access  Private/Admin
 */
exports.deleteAllUserHistory = async (req, res, next) => {
    try {
        const { userId } = req.params;

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Delete all attempts for this user
        const result = await ToeicAttempt.deleteMany({ userId });

        res.json({
            success: true,
            message: `Deleted ${result.deletedCount} practice history entries for user ${userId}`,
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete all practice history (Admin only)
 * @route   DELETE /api/toeic/admin/practice-history/all
 * @access  Private/Admin
 */
exports.deleteAllHistory = async (req, res, next) => {
    try {
        // Delete all attempts
        const result = await ToeicAttempt.deleteMany({});

        res.json({
            success: true,
            message: `Deleted all ${result.deletedCount} practice history entries`,
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = exports;
