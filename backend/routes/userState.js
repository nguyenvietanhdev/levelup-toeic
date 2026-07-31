// routes/userState.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth'); // ← đúng cách

const {
    getState,
    saveState,
    updateResources,
    updateProgress,
    addXp,
    unlockAchievement,
    updateQuests,
} = require('../controllers/userStateController');

router.use(protect); // ← áp dụng cho tất cả route bên dưới

router.delete('/progress', async (req, res) => {
    try {
        const userId = req.user.id;

        // Kiểm tra client gửi đúng userId — phát hiện token/session bị lẫn giữa 2 tài khoản
        const { confirmUserId } = req.body;
        if (confirmUserId && confirmUserId.toString() !== userId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Token không khớp với tài khoản hiện tại. Vui lòng đăng xuất và đăng nhập lại.',
            });
        }

        const UserStats      = require('../models/UserStats');
        const UserProfile    = require('../models/UserProfile');
        const WrongWord      = require('../models/WrongWord');
        const UserAchievement = require('../models/UserAchievement');
        const UserQuest      = require('../models/UserQuest');
        const UserDailyQuest = require('../models/UserDailyQuest');
        const PracticeSession = require('../models/PracticeSession');
        const ToeicAttempt   = require('../models/ToeicAttempt');
        const UserCheckin    = require('../models/UserCheckin');
        const Notification   = require('../models/Notification');
        const User           = require('../models/User');

        const statsReset = {
            xp: 0, totalXp: 0,
            coins: 0, gems: 0, energy: 100, maxEnergy: 100, lastEnergyUpdate: new Date(),
            hints: 0, shields: 0, timeFreezes: 0,
            streakCurrent: 0, streakLongest: 0, streakLastPlayDate: null, streakShieldsUsed: 0,
            wordsLearned: [], wordsMastered: [],
            totalSessions: 0, totalGamesPlayed: 0, totalQuestionsAnswered: 0,
            totalCorrectAnswers: 0, totalWrongAnswers: 0, perfectRounds: 0,
            highestScore: 0, totalPlayTime: 0,
            modeStats: {},
            practiceHistory: [],
            xpBoostActive: false, xpBoostMultiplier: 1, xpBoostExpiresAt: null,
            coinsBoostActive: false, coinsBoostMultiplier: 1, coinsBoostExpiresAt: null,
        };

        await Promise.all([
            UserStats.findOneAndUpdate({ userId }, { $set: statsReset }),
            UserProfile.findOneAndUpdate({ userId }, { $set: { level: 1, currentLevelXp: 0 } }),
            WrongWord.deleteMany({ userId }),
            UserAchievement.deleteMany({ userId }),
            UserQuest.deleteMany({ userId }),
            UserDailyQuest.deleteMany({ userId }),
            PracticeSession.deleteMany({ userId }),
            ToeicAttempt.deleteMany({ userId }),
            UserCheckin.deleteMany({ userId }),
            Notification.deleteMany({ userId }),
            User.findByIdAndUpdate(userId, { $set: { favoriteWords: [] } }),
        ]);

        res.json({ success: true, message: 'Đã xóa toàn bộ tiến trình' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Heartbeat — cập nhật lastLoginAt để leaderboard biết user đang online
router.post('/heartbeat', async (req, res) => {
    await require('../models/User').findByIdAndUpdate(req.user.id, { lastLoginAt: Date.now() });
    res.json({ success: true });
});

router.get('/state', getState);
router.post('/state', saveState);
router.patch('/resources', updateResources);
router.patch('/progress', updateProgress);
router.patch('/quests', updateQuests);
router.post('/xp', addXp);
router.post('/achievement', unlockAchievement);

// Lịch sử giao dịch (collection riêng, mới nhất trước).
router.get('/transactions', async (req, res, next) => {
    try {
        const Transaction = require('../models/Transaction');
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
        const data = await Transaction.find({ userId: req.user.id })
            .sort({ at: -1 }).limit(limit).lean();
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ── Like hồ sơ người khác (mỗi tài khoản 1 like/người, bấm lại = bỏ like) ──
const ProfileLike = require('../models/ProfileLike');
const UserProfileModel = require('../models/UserProfile');

// Trạng thái like + tổng số like của 1 người.
router.get('/like/:targetId', async (req, res, next) => {
    try {
        const targetId = req.params.targetId;
        const [mine, profile] = await Promise.all([
            ProfileLike.findOne({ likerId: req.user.id, targetId }).lean(),
            UserProfileModel.findOne({ userId: targetId }).select('likeCount').lean(),
        ]);
        res.json({ success: true, liked: !!mine, likeCount: profile?.likeCount || 0 });
    } catch (err) { next(err); }
});

// Toggle like.
router.post('/like/:targetId', async (req, res, next) => {
    try {
        const targetId = req.params.targetId;
        if (String(targetId) === String(req.user.id)) {
            return res.status(400).json({ success: false, message: 'Không thể tự like chính mình' });
        }
        const existing = await ProfileLike.findOne({ likerId: req.user.id, targetId });
        let liked;
        if (existing) {
            await ProfileLike.deleteOne({ _id: existing._id });
            await UserProfileModel.updateOne({ userId: targetId, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
            liked = false;
        } else {
            await ProfileLike.create({ likerId: req.user.id, targetId });
            await UserProfileModel.updateOne({ userId: targetId }, { $inc: { likeCount: 1 } });
            liked = true;
        }
        const profile = await UserProfileModel.findOne({ userId: targetId }).select('likeCount').lean();
        res.json({ success: true, liked, likeCount: profile?.likeCount || 0 });
    } catch (err) {
        // Trùng key do double-click → coi như đã like.
        if (err && err.code === 11000) return res.json({ success: true, liked: true });
        next(err);
    }
});

module.exports = router;