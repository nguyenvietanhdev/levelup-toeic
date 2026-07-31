// ===================================
// TOEIC ANALYTICS CONTROLLER
// ===================================
// Split out of toeicController (P4). Self-contained read-only analytics
// over ToeicAttempt — no exam-engine helpers. Verbatim move; behaviour
// unchanged. routes/toeic.js imports these from here now.

const ToeicAttempt = require('../models/ToeicAttempt');
const UserProfile = require('../models/UserProfile');
const { predictToeicScore } = require('../services/toeicPrediction');

/**
 * @desc    Get user analytics overview
 * @route   GET /api/toeic/analytics/overview
 * @access  Private
 */
exports.getAnalyticsOverview = async (req, res, next) => {
    try {
        const analytics = await ToeicAttempt.getUserAnalytics(req.user.id);

        res.json({
            success: true,
            data: analytics,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get score progression
 * @route   GET /api/toeic/analytics/progress
 * @access  Private
 */
exports.getScoreProgress = async (req, res, next) => {
    try {
        const { limit = 10 } = req.query;

        const progression = await ToeicAttempt.getScoreProgression(
            req.user.id,
            parseInt(limit)
        );

        res.json({
            success: true,
            data: progression,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get part-by-part analysis
 * @route   GET /api/toeic/analytics/parts
 * @access  Private
 */
exports.getPartAnalysis = async (req, res, next) => {
    try {
        const attempts = await ToeicAttempt.find({
            userId: req.user.id,
            status: 'completed',
        }).select('partScores').lean();

        // Aggregate part scores
        const partStats = {};

        for (const attempt of attempts) {
            for (const partScore of attempt.partScores) {
                const part = partScore.partNumber;

                if (!partStats[part]) {
                    partStats[part] = {
                        partNumber: part,
                        attempts: 0,
                        totalAccuracy: 0,
                        avgAccuracy: 0,
                    };
                }

                partStats[part].attempts += 1;
                partStats[part].totalAccuracy += partScore.accuracy;
            }
        }

        // Calculate averages
        const analysis = Object.values(partStats).map(stat => ({
            ...stat,
            avgAccuracy: Math.round(stat.totalAccuracy / stat.attempts),
        }));

        res.json({
            success: true,
            data: analysis,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Phân tích TỐC ĐỘ phản hồi mỗi câu (giây/câu theo Part + đoán bừa).
 * @route   GET /api/toeic/analytics/speed
 * @access  Private
 *
 * Đọc answers[].timeSpent (ms). Bỏ câu timeSpent phi lý (0 hoặc > 5 phút) —
 * vừa loại nhiễu, vừa loại dữ liệu CŨ (trước bản vá per-question timeSpent còn
 * là thời gian cộng dồn từ đầu bài nên câu cuối lên tới hàng chục phút).
 */
// Nhịp chuẩn TOEIC: giây/câu = thời gian Part / số câu (khớp createFullTest).
const TARGET_SEC_PER_Q = { 1: 40, 2: 24, 3: 26, 4: 30, 5: 24, 6: 30, 7: 38 };
const MAX_PLAUSIBLE_MS = 5 * 60 * 1000; // > 5 phút/câu = dữ liệu hỏng, bỏ
const RUSH_MS = 3000;                    // trả lời < 3s mà sai = đoán bừa

exports.getSpeedAnalysis = async (req, res, next) => {
    try {
        const attempts = await ToeicAttempt.find({
            userId: req.user.id,
            status: 'completed',
        }).select('answers completedAt').sort({ completedAt: 1 }).lean();

        const byPart = {};   // part → { totalMs, count, correctMs, correctCount }
        let usable = 0, rushWrong = 0, slowRight = 0;
        const trend = [];    // tốc độ TB mỗi bài theo thời gian

        for (const att of attempts) {
            let attMs = 0, attCount = 0;
            for (const a of (att.answers || [])) {
                const ms = Number(a.timeSpent);
                if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_PLAUSIBLE_MS) continue;
                const p = a.partNumber;
                if (!byPart[p]) byPart[p] = { partNumber: p, totalMs: 0, count: 0 };
                byPart[p].totalMs += ms;
                byPart[p].count += 1;
                usable += 1;
                attMs += ms; attCount += 1;

                const target = (TARGET_SEC_PER_Q[p] || 30) * 1000;
                if (!a.isCorrect && ms < RUSH_MS) rushWrong += 1;
                if (a.isCorrect && ms > target * 2) slowRight += 1;
            }
            if (attCount > 0) {
                trend.push({
                    date: att.completedAt,
                    avgSec: Math.round(attMs / attCount / 1000),
                });
            }
        }

        const parts = Object.values(byPart).map(s => ({
            partNumber: s.partNumber,
            avgSec: Math.round(s.totalMs / s.count / 10) / 100, // 2 chữ số thập phân
            targetSec: TARGET_SEC_PER_Q[s.partNumber] || 30,
            count: s.count,
        })).sort((a, b) => a.partNumber - b.partNumber);

        res.json({
            success: true,
            data: {
                hasData: usable > 0,
                usableAnswers: usable,
                parts,
                rushWrong,   // câu bấm dưới 3s mà sai
                slowRight,   // câu đúng nhưng ngốn > 2× nhịp chuẩn
                trend: trend.slice(-15), // 15 bài gần nhất
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = exports;

/**
 * @desc    Ước lượng điểm "nếu đi thi thật" + đối chiếu mục tiêu người dùng đặt
 * @route   GET /api/toeic/analytics/prediction
 * @access  Private
 *
 * Mục tiêu đọc từ settings của user (server-authoritative), không nhận từ query
 * — để con số đối chiếu luôn là con số đã lưu, không phải thứ client gửi lên.
 */
exports.getScorePrediction = async (req, res, next) => {
    try {
        const [attempts, profile] = await Promise.all([
            ToeicAttempt.find({ userId: req.user.id, status: 'completed' })
                .sort({ completedAt: -1 })
                .limit(30)   // đủ để thấy xu hướng; xa hơn nữa đã lỗi thời
                .select('testType totalScore listeningScore readingScore partScores completedAt')
                .lean(),
            UserProfile.findOne({ userId: req.user.id }).select('settings.toeicTargetScore').lean(),
        ]);

        const target = Number(profile?.settings?.toeicTargetScore) || 0;
        const data = predictToeicScore(attempts, target);

        res.json({
            success: true,
            data: data || { enough: false, reason: 'Chưa làm bài thi nào', target: target || null },
        });
    } catch (error) {
        next(error);
    }
};
