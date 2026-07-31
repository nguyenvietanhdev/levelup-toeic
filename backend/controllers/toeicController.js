const { buildTestQuestions, findQuestionById, findQuestionsByIds, recordAnswerStat } = require('../services/questionSetService');
const ToeicTest = require('../models/ToeicTest');
const ToeicAttempt = require('../models/ToeicAttempt');
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const { getScoreInterpretation } = require('../utils/toeicScoreConverter');
const { logTxn } = require('../utils/economyLog');
const fs = require('fs');
const path = require('path');
const cloud = require('../utils/cloudinary');
const { resolveTestFolder, uniqueFilename } = require('../middleware/upload');

// ===================================
// TEST TAKING
// ===================================

/**
 * @desc    Start a test attempt
 * @route   POST /api/toeic/attempts/start
 * @access  Private
 */
// ── Chi phí & phần thưởng bài TOEIC — TỈ LỆ THEO SỐ CÂU ───────────────────────
// Trước đây thưởng cố định theo accuracy (tối đa 1000 XP / 500 xu) BẤT KỂ đề dài
// ngắn → bài 6 câu cho bằng bài 200 câu, spam vài phút là lên chục level.
// Nay mọi thứ quy theo số câu để công bằng và không phá hệ thống mở khoá Level.
const TOEIC_ENERGY_PER_Q = 0.6;   // 6 câu ≈ 5⚡ · 25 câu ≈ 15⚡ · 200 câu ≈ 60⚡
const TOEIC_ENERGY_MIN = 5;
const TOEIC_ENERGY_MAX = 60;
const TOEIC_XP_PER_Q = 5;         // 100% đúng: 6 câu = 30 XP · 200 câu = 1000 XP
const TOEIC_COINS_PER_Q = 2;      // 100% đúng: 6 câu = 12 xu · 200 câu = 400 xu

function toeicEnergyCost(totalQuestions) {
    const raw = Math.round((totalQuestions || 0) * TOEIC_ENERGY_PER_Q);
    return Math.min(TOEIC_ENERGY_MAX, Math.max(TOEIC_ENERGY_MIN, raw));
}

exports.startAttempt = async (req, res, next) => {
    try {
        const { testId, fillBlankMode } = req.body;

        const test = await ToeicTest.findById(testId)
            .populate('parts.questions');

        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found',
            });
        }

        const [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId: req.user.id }).lean(),
            UserStats.findOne({ userId: req.user.id }).lean(),
        ]);

        const access = test.canUserAccess({ level: profile?.level ?? 1, coins: stats?.coins ?? 0 });

        if (!access.allowed) {
            return res.status(403).json({
                success: false,
                message: access.reason,
            });
        }

        // Dùng lại bài dở CHỈ khi nó vừa được tạo trong ít giây gần đây — để chống
        // double-charge do client gọi start trùng (StrictMode/remount/double-click,
        // đều cách nhau <1s). KHÔNG dùng lại bài dở CŨ: bỏ dở phiên trước rồi bấm
        // "Bắt đầu" lại là bắt đầu MỚI → phải trừ năng lượng như thường (nếu muốn
        // làm tiếp bài cũ thì dùng nút "Tiếp tục" = resume, không trừ). Trước đây
        // reuse vô thời hạn nên vào lại bài bỏ dở là miễn phí mãi.
        const REUSE_WINDOW_MS = 5 * 1000;
        let attempt = await ToeicAttempt.findOne({
            userId: req.user.id,
            testId: test._id,
            status: 'in-progress',
            createdAt: { $gte: new Date(Date.now() - REUSE_WINDOW_MS) },
        }).sort({ createdAt: -1 });

        if (!attempt) {
            // ── Thanh toán: VÀNG trước, NĂNG LƯỢNG sau ───────────────────────
            // Cả hai đều atomic (điều kiện $gte trong filter) vì `stats` đọc bằng
            // .lean() nên số dư có thể đã cũ — canUserAccess ở trên chỉ là kiểm
            // tra sớm để báo lỗi đẹp, KHÔNG được coi là bảo đảm.
            // Vàng đi trước vì nó KHÔNG tự hồi: bước sau hỏng thì hoàn vàng an toàn.
            const coinCost = (!test.isFree && test.requiredCoins > 0) ? test.requiredCoins : 0;
            if (coinCost > 0) {
                const coinsPaid = await UserStats.findOneAndUpdate(
                    { userId: req.user.id, coins: { $gte: coinCost } },
                    { $inc: { coins: -coinCost } }
                );
                if (!coinsPaid) {
                    return res.status(400).json({
                        success: false,
                        message: `Không đủ xu! Cần ${coinCost} xu để mở bài thi này.`,
                        coinsNeeded: coinCost,
                        currentCoins: stats?.coins ?? 0,
                    });
                }
            }

            const energyCost = toeicEnergyCost(test.totalQuestions);
            const paid = await UserStats.findOneAndUpdate(
                { userId: req.user.id, energy: { $gte: energyCost } },
                { $inc: { energy: -energyCost }, $set: { lastEnergyUpdate: new Date() } },
                { new: true }
            );
            if (!paid) {
                // Thiếu năng lượng → hoàn lại vàng đã trừ, không để user mất trắng.
                if (coinCost > 0) {
                    await UserStats.updateOne({ userId: req.user.id }, { $inc: { coins: coinCost } });
                }
                return res.status(400).json({
                    success: false,
                    message: `Không đủ năng lượng! Cần ${energyCost}⚡ cho bài ${test.totalQuestions} câu.`,
                    energyNeeded: energyCost,
                    currentEnergy: stats?.energy ?? 0,
                });
            }

            // Bắt đầu MỚI (đã trừ năng lượng) → bỏ mọi bài dở CŨ của đề này để
            // không tích tụ nhiều bài in-progress (bài cũ 0 câu = mất mát bằng 0;
            // nếu có câu thì user đã chủ động chọn "Bắt đầu" thay vì "Tiếp tục").
            await ToeicAttempt.updateMany(
                { userId: req.user.id, testId: test._id, status: 'in-progress' },
                { $set: { status: 'abandoned' } }
            );

            attempt = await ToeicAttempt.create({
                userId: req.user.id,
                testId: test._id,
                testType: test.testType,
                testName: test.testName,
                totalQuestions: test.totalQuestions,
                fillBlankMode: !!fillBlankMode,
                status: 'in-progress',
            });
        }

        // Dàn phẳng theo ĐÚNG THỨ TỰ THI (part → số câu). Thứ tự nằm trong
        // buildTestQuestions, dùng chung với đường "tiếp tục bài dở" bên dưới —
        // hai chỗ lệch nhau là làm bài một đằng, xem lại một nẻo.
        const questions = buildTestQuestions(test, { includeAnswers: !!fillBlankMode });

        // Calculate section information
        const listeningQuestions = questions.filter(q => q.section === 'listening').length;
        const readingQuestions = questions.filter(q => q.section === 'reading').length;

        // Trả về số dư MỚI (server-authoritative) để client cập nhật thanh năng
        // lượng/ví ngay. Nếu tạo attempt mới thì energy/xu đã bị trừ ở trên; nếu
        // dùng lại bài dở thì số dư không đổi — cả hai đều phản ánh đúng ở đây.
        const freshStats = await UserStats.findOne({ userId: req.user.id })
            .select('energy maxEnergy coins gems hints shields timeFreezes lastEnergyUpdate').lean();

        res.json({
            success: true,
            message: 'Test started successfully',
            data: {
                resources: freshStats ? {
                    energy: freshStats.energy,
                    maxEnergy: freshStats.maxEnergy,
                    coins: freshStats.coins,
                    gems: freshStats.gems,
                    hints: freshStats.hints,
                    shields: freshStats.shields,
                    timeFreezes: freshStats.timeFreezes,
                    lastEnergyUpdate: freshStats.lastEnergyUpdate,
                } : undefined,
                attemptId: attempt._id,
                test: {
                    id: test._id,
                    testName: test.testName,
                    testType: test.testType,
                    totalQuestions: test.totalQuestions,
                    totalTime: test.totalTime,
                    parts: test.parts.map(p => ({
                        partNumber: p.partNumber,
                        questionsCount: p.questionsCount,
                        timeLimit: p.timeLimit,
                    })),
                    sections: {
                        listening: {
                            questionsCount: listeningQuestions,
                            parts: [1, 2, 3, 4].filter(p => test.parts.find(part => part.partNumber === p)),
                        },
                        reading: {
                            questionsCount: readingQuestions,
                            parts: [5, 6, 7].filter(p => test.parts.find(part => part.partNumber === p)),
                        },
                    },
                },
                questions,
                startedAt: attempt.startedAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Submit answer for a question
 * @route   PUT /api/toeic/attempts/:id/answer
 * @access  Private
 */
exports.submitAnswer = async (req, res, next) => {
    try {
        const { questionId, userAnswer, timeSpent, isMarkedForReview } = req.body;

        const attempt = await ToeicAttempt.findById(req.params.id);

        if (!attempt) {
            return res.status(404).json({
                success: false,
                message: 'Attempt not found',
            });
        }

        if (attempt.userId.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized',
            });
        }

        if (attempt.status !== 'in-progress') {
            return res.status(400).json({
                success: false,
                message: 'This attempt is already completed',
            });
        }

        // Get correct answer
        const question = await findQuestionById(questionId);

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found',
            });
        }

        // Submit answer
        attempt.submitAnswer({
            questionId,
            partNumber: question.part,
            userAnswer,
            correctAnswer: question.correctAnswer,
            timeSpent,
            isMarkedForReview,
        });

        await attempt.save();

        res.json({
            success: true,
            message: 'Answer submitted successfully',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Pause test
 * @route   PUT /api/toeic/attempts/:id/pause
 * @access  Private
 */
exports.pauseAttempt = async (req, res, next) => {
    try {
        const attempt = await ToeicAttempt.findById(req.params.id);

        if (!attempt) {
            return res.status(404).json({
                success: false,
                message: 'Attempt not found',
            });
        }

        if (attempt.userId.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized',
            });
        }

        attempt.pauseTest();
        await attempt.save();

        res.json({
            success: true,
            message: 'Test paused',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Resume test
 * @route   PUT /api/toeic/attempts/:id/resume
 * @access  Private
 */
exports.resumeAttempt = async (req, res, next) => {
    try {
        const attempt = await ToeicAttempt.findById(req.params.id);

        if (!attempt) {
            return res.status(404).json({
                success: false,
                message: 'Attempt not found',
            });
        }

        if (attempt.userId.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized',
            });
        }

        attempt.resumeTest();
        await attempt.save();

        // Tải lại ĐỦ câu hỏi của đề (không chỉ câu đã trả lời) + map đáp án đã lưu
        // → client hiển thị tiếp đúng trạng thái.
        //
        // part.questions là các MÀN (ToeicQuestionSet), phải DÀN PHẲNG y hệt
        // startAttempt. Trước đây chỗ này đọc `question.options` ở cấp document
        // — mà options nằm trong questions[] của màn — nên tiếp tục bài xong là
        // cột đáp án trống trơn.
        const test = await ToeicTest.findById(attempt.testId).populate('parts.questions');
        // CÙNG một hàm với startAttempt: thứ tự lúc tiếp tục phải khớp tuyệt đối
        // với lúc bắt đầu, vì đáp án đã lưu được map lại theo VỊ TRÍ trong mảng.
        const questions = test ? buildTestQuestions(test) : [];

        const answerByQid = new Map((attempt.answers || []).map(a => [a.questionId?.toString(), a.userAnswer]));
        const answers = {};
        questions.forEach((q, i) => {
            const ua = answerByQid.get(q._id?.toString());
            if (ua) answers[i] = ua;
        });

        // Thời gian CÒN LẠI = tổng thời gian đề − đã trôi (trừ lúc tạm dừng).
        // Thiếu con số này thì client không biết đếm ngược từ đâu nên quay ra
        // đếm TIẾN như đồng hồ bấm giờ.
        let timeRemaining = null;
        if (test?.totalTime) {
            const elapsed = (Date.now() - new Date(attempt.startedAt).getTime()) / 1000
                - (attempt.totalPauseDuration || 0);
            timeRemaining = Math.max(0, Math.round(test.totalTime - elapsed));
        }

        res.json({
            success: true,
            message: 'Test resumed',
            data: {
                attemptId: attempt._id,
                test: test ? {
                    id: test._id,
                    testName: test.testName,
                    testType: test.testType,
                    totalQuestions: test.totalQuestions,
                    totalTime: test.totalTime,
                } : null,
                questions,
                answers,
                markedQuestions: attempt.markedQuestions || [],
                timeRemaining,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Submit final test
 * @route   POST /api/toeic/attempts/:id/submit
 * @access  Private
 */
exports.submitAttempt = async (req, res, next) => {
    try {
        const { duration } = req.body;

        const attempt = await ToeicAttempt.findById(req.params.id);

        if (!attempt) {
            return res.status(404).json({
                success: false,
                message: 'Attempt not found',
            });
        }

        if (attempt.userId.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized',
            });
        }

        if (attempt.status !== 'in-progress') {
            return res.status(400).json({
                success: false,
                message: 'This attempt is already completed',
            });
        }

        // Set duration
        attempt.duration = duration || 0;

        // Calculate scores
        await attempt.calculateScores();

        // Calculate improvement
        await attempt.calculateImprovement();

        // Thống kê từng câu. findQuestionById trả OBJECT THUẦN (lean) nên không
        // gọi được method Mongoose — phải cập nhật qua service.
        await Promise.all(
            attempt.answers.map(a => recordAnswerStat(a.questionId, a.isCorrect))
        );

        // Update test statistics
        const test = await ToeicTest.findById(attempt.testId);
        if (test) {
            test.updateStats({
                totalScore: attempt.totalScore,
                listeningScore: attempt.listeningScore,
                readingScore: attempt.readingScore,
                isCompleted: true,
            });
            await test.save();
        }

        // Award rewards (XP, coins). KHÔNG .lean() — bên dưới có mutate + .save().
        const [toeicProfile, toeicStats] = await Promise.all([
            UserProfile.findOne({ userId: req.user.id }),
            UserStats.findOne({ userId: req.user.id }),
        ]);

        // Calculate rewards based on performance
        // Quy theo SỐ CÂU: đề càng dài thưởng càng nhiều (xem ghi chú đầu file).
        const qCount = attempt.totalQuestions || 0;
        const accRatio = (attempt.accuracy || 0) / 100;
        const baseXp = Math.round(accRatio * qCount * TOEIC_XP_PER_Q);
        // Bonus cũng chặn theo cỡ đề để bài 6 câu không "ăn" bonus như bài full.
        const sizeCap = Math.min(50, Math.round(qCount * 1.5));
        const bonusXp = attempt.isPersonalBest ? Math.min(100, Math.round(qCount * 2)) : 0;
        const perfectPartBonus = attempt.isPerfectPart.length * sizeCap;

        attempt.xpEarned = baseXp + bonusXp + perfectPartBonus;
        attempt.coinsEarned = Math.round(accRatio * qCount * TOEIC_COINS_PER_Q);

        if (attempt.totalScore >= 900) attempt.gemsEarned = 5;
        else if (attempt.totalScore >= 700) attempt.gemsEarned = 2;

        // Update stats
        if (toeicStats) {
            const { applyLevelUp } = require('../utils/userStateHelper');
            toeicStats.xp += attempt.xpEarned;
            toeicStats.totalXp += attempt.xpEarned;
            toeicStats.coins += attempt.coinsEarned;
            if (attempt.gemsEarned > 0) toeicStats.gems += attempt.gemsEarned;
            if (toeicProfile) applyLevelUp(toeicProfile, toeicStats);
            await Promise.all([toeicStats.save(), toeicProfile?.save()]);
            if (attempt.coinsEarned) logTxn(req.user.id, { type: 'toeic', direction: 'in', name: 'Thưởng bài TOEIC', amount: attempt.coinsEarned, currency: 'coins', balanceAfter: toeicStats.coins });
            if (attempt.gemsEarned)  logTxn(req.user.id, { type: 'toeic', direction: 'in', name: 'Thưởng bài TOEIC', amount: attempt.gemsEarned, currency: 'gems', balanceAfter: toeicStats.gems });
        }

        await attempt.save();

        // Get interpretation
        const interpretation = getScoreInterpretation(
            attempt.totalScore,
            attempt.listeningScore,
            attempt.readingScore
        );

        // Batch fetch all questions in one query instead of N individual queries
        const questionIds = attempt.answers.map(a => a.questionId);
        const questionMap = await findQuestionsByIds(questionIds);

        const questionsReview = attempt.answers.map((ans) => {
            const q = questionMap.get(ans.questionId?.toString());
            return {
                questionId: ans.questionId,
                userAnswer: ans.userAnswer || null,
                correctAnswer: ans.correctAnswer,
                isCorrect: ans.isCorrect,
                part: ans.partNumber,
                // Số câu THẬT chuẩn TOEIC — thiếu nó thì màn kết quả phải đánh
                // số theo vị trí (Câu 1, 2…) không khớp số câu lúc làm bài.
                questionNumber: q?.questionNumber ?? null,
                questionText: q?.questionText || '',
                imageUrls: q?.imageUrls || [],
                passages: q?.passages || [],
                audioUrl: q?.audioUrl || null,
                audioText: q?.audioText || null,
                groupId: q?.groupId || null,
                questionIndex: q?.questionIndex || null,
                options: q?.options?.map(o => ({ label: o.label, text: o.text })) || [],
                explanation: q?.explanation || {},
            };
        });

        res.json({
            success: true,
            message: 'Test completed successfully',
            data: {
                ...attempt.getDetailedResults(),
                interpretation,
                questions: questionsReview,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get attempt details and review
 * @route   GET /api/toeic/attempts/:id/review
 * @access  Private
 */
exports.getAttemptReview = async (req, res, next) => {
    try {
        // KHÔNG populate wrongQuestions/markedQuestions: id giờ trỏ sub-document
        // trong ToeicQuestionSet nên ref không khớp được. Danh sách câu đầy đủ
        // đã dựng bên dưới qua findQuestionsByIds.
        const attempt = await ToeicAttempt.findById(req.params.id);

        if (!attempt) {
            return res.status(404).json({
                success: false,
                message: 'Attempt not found',
            });
        }

        if (attempt.userId.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized',
            });
        }

        // Batch fetch all questions in one query
        const reviewQuestionIds = attempt.answers.map(a => a.questionId);
        const reviewQuestionMap = await findQuestionsByIds(reviewQuestionIds);

        const questions = attempt.answers
            .map((answer) => {
                const question = reviewQuestionMap.get(answer.questionId?.toString());
                if (!question) return null;
                return {
                    questionId: question._id,
                    part: question.part,
                    questionNumber: question.questionNumber,
                    questionText: question.questionText || '',
                    passages: question.passages || [],
                    imageUrls: question.imageUrls || [],
                    audioUrl: question.audioUrl || '',
                    audioText: question.audioText || '',
                    groupId: question.groupId || null,
                    questionIndex: question.questionIndex || null,
                    options: question.options || [],
                    correctAnswer: answer.correctAnswer,
                    userAnswer: answer.userAnswer || '',
                    isCorrect: answer.isCorrect,
                    timeSpent: answer.timeSpent,
                    explanation: question.explanation || {},
                };
            })
            .filter(q => q !== null);

        // Mark as reviewed
        if (!attempt.hasReviewed) {
            attempt.hasReviewed = true;
            attempt.reviewedAt = new Date();
            await attempt.save();
        }

        res.json({
            success: true,
            data: {
                ...attempt.getDetailedResults(),
                questions: questions,
                answers: attempt.answers,
                wrongQuestions: attempt.wrongQuestions,
                markedQuestions: attempt.markedQuestions,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ===================================
// USER ANALYTICS
// ===================================

/**
 * @desc    Get user's in-progress attempt (if any) — for resume on page reload
 * @route   GET /api/toeic/my-attempts/in-progress
 * @access  Private
 */
exports.getInProgressAttempt = async (req, res, next) => {
    try {
        const attempt = await ToeicAttempt.findOne({
            userId: req.user.id,
            status: 'in-progress',
        })
            .sort({ startedAt: -1 })
            .populate('testId', 'title testType totalQuestions timeLimit');

        if (!attempt) {
            return res.json({ success: true, data: null });
        }

        res.json({ success: true, data: attempt });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get user's test history
 * @route   GET /api/toeic/my-attempts
 * @access  Private
 */
exports.getMyAttempts = async (req, res, next) => {
    try {
        const { testType, page = 1, limit = 10 } = req.query;

        const attempts = await ToeicAttempt.getUserHistory(req.user.id, {
            testType,
            limit: parseInt(limit),
            skip: (parseInt(page) - 1) * parseInt(limit),
        });

        const total = await ToeicAttempt.countDocuments({
            userId: req.user.id,
            status: 'completed',
            ...(testType && { testType }),
        });

        res.json({
            success: true,
            count: attempts.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: attempts,
        });
    } catch (error) {
        next(error);
    }
};

// ===================================
// FILE UPLOAD (IMAGES & AUDIO)
// ===================================

/**
 * @desc    Upload image for Part 1 questions
 * @route   POST /api/toeic/upload/part1-image
 * @access  Private/Admin
 */
// Ghi buffer xuống đĩa theo đúng quy ước cũ (thư mục theo source, tên không đè).
// Trả về URL /assets/... như trước. Dùng khi CHƯA cấu hình Cloudinary.
function saveBufferToDisk(req, kind /* 'images' | 'audio' */) {
    const folder = resolveTestFolder(req, req.file);
    const destPath = `public/assets/${kind}/${folder}/`;
    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
    const name = uniqueFilename(destPath, req.file.originalname);
    fs.writeFileSync(path.join(destPath, name), req.file.buffer);
    return `/assets/${kind}/${folder}/${name}`;
}

exports.uploadPart1Image = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        // Có Cloudinary → đẩy lên cloud (URL https, sống qua mọi lần redeploy).
        // Không → ghi đĩa như cũ để dev/local vẫn chạy.
        const folder = resolveTestFolder(req, req.file);
        const imageUrl = cloud.isConfigured()
            ? await cloud.uploadBuffer(req.file.buffer, {
                folder: `toeic/images/${folder}`,
                resourceType: 'image',
                publicId: path.parse(req.file.originalname).name,
            })
            : saveBufferToDisk(req, 'images');

        res.json({ success: true, message: 'Image uploaded successfully', imageUrl });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Upload audio file for listening questions
 * @route   POST /api/toeic/upload/audio
 * @access  Private/Admin
 */
exports.uploadAudio = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        // Audio để resource_type 'video' trên Cloudinary (họ xếp audio nhóm video).
        const folder = resolveTestFolder(req, req.file);
        const audioUrl = cloud.isConfigured()
            ? await cloud.uploadBuffer(req.file.buffer, {
                folder: `toeic/audio/${folder}`,
                resourceType: 'video',
                publicId: path.parse(req.file.originalname).name,
            })
            : saveBufferToDisk(req, 'audio');

        res.json({ success: true, message: 'Audio uploaded successfully', audioUrl });
    } catch (error) {
        next(error);
    }
};


module.exports = exports;
