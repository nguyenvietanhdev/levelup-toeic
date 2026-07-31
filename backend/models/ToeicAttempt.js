const mongoose = require('mongoose');

const PauseRecordSchema = new mongoose.Schema({
    pausedAt: { type: Date, required: true },
    resumedAt: { type: Date },
}, { _id: false });

const AnswerSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        // ID của MỘT CÂU = _id sub-document trong ToeicQuestionSet.
        // Không dùng populate được (ref chỉ khớp _id cấp document);
        // tra cứu qua services/questionSetService.findQuestionsByIds.
        ref: 'ToeicQuestionSet',
        required: true,
    },
    partNumber: {
        type: Number,
        required: true,
        enum: [1, 2, 3, 4, 5, 6, 7],
    },
    userAnswer: {
        type: String,
        enum: ['A', 'B', 'C', 'D', ''],
        default: '',
    },
    correctAnswer: {
        type: String,
        required: true,
        enum: ['A', 'B', 'C', 'D'],
    },
    isCorrect: {
        type: Boolean,
        default: false,
    },
    timeSpent: {
        type: Number, // milliseconds
        default: 0,
    },
    isMarkedForReview: {
        type: Boolean,
        default: false,
    },
}, { _id: false });

const PartScoreSchema = new mongoose.Schema({
    partNumber: {
        type: Number,
        required: true,
        enum: [1, 2, 3, 4, 5, 6, 7],
    },
    totalQuestions: {
        type: Number,
        required: true,
    },
    correctAnswers: {
        type: Number,
        default: 0,
    },
    wrongAnswers: {
        type: Number,
        default: 0,
    },
    skippedAnswers: {
        type: Number,
        default: 0,
    },
    accuracy: {
        type: Number,
        default: 0,
    },
    timeSpent: {
        type: Number, // seconds
        default: 0,
    },
    score: {
        type: Number,
        default: 0,
    },
}, { _id: false });

const SkillAnalysisSchema = new mongoose.Schema({
    skill: {
        type: String,
        required: true,
    },
    correctCount: {
        type: Number,
        default: 0,
    },
    totalCount: {
        type: Number,
        default: 0,
    },
    accuracy: {
        type: Number,
        default: 0,
    },
}, { _id: false });

const ToeicAttemptSchema = new mongoose.Schema({
    // ===================================
    // USER & TEST REFERENCES
    // ===================================
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    testId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ToeicTest',
        required: true,
        index: true,
    },
    testType: {
        type: String,
        required: true,
        index: true,
    },
    testName: {
        type: String,
        required: true,
    },
    // Chế độ Nghe Đục Lỗ (fill-in-blank) — phân biệt với Mini Test thường
    // dù cùng testType mini-partN.
    fillBlankMode: {
        type: Boolean,
        default: false,
    },

    // ===================================
    // SESSION INFO
    // ===================================
    startedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    completedAt: {
        type: Date,
    },
    duration: {
        type: Number, // Total time in seconds
        default: 0,
    },
    isPaused: {
        type: Boolean,
        default: false,
    },
    pausedTimes: [PauseRecordSchema],
    totalPauseDuration: {
        type: Number, // Total pause time in seconds
        default: 0,
    },

    // ===================================
    // ANSWERS
    // ===================================
    answers: [AnswerSchema],
    currentQuestionIndex: {
        type: Number,
        default: 0,
    },
    currentPartNumber: {
        type: Number,
        default: 1,
    },

    // ===================================
    // OVERALL SCORES
    // ===================================
    totalQuestions: {
        type: Number,
        required: true,
    },
    correctAnswers: {
        type: Number,
        default: 0,
    },
    wrongAnswers: {
        type: Number,
        default: 0,
    },
    skippedAnswers: {
        type: Number,
        default: 0,
    },
    accuracy: {
        type: Number,
        default: 0,
    },
    rawScore: {
        type: Number,
        default: 0,
    },

    // ===================================
    // TOEIC SCORE CONVERSION
    // ===================================
    listeningScore: {
        type: Number, // 5-495
        min: 5,
        max: 495,
        default: 5,
    },
    readingScore: {
        type: Number, // 5-495
        min: 5,
        max: 495,
        default: 5,
    },
    totalScore: {
        type: Number, // 10-990
        min: 10,
        max: 990,
        default: 10,
    },

    // ===================================
    // PART-BY-PART BREAKDOWN
    // ===================================
    partScores: [PartScoreSchema],

    // ===================================
    // PERFORMANCE ANALYSIS
    // ===================================
    strengthParts: [{
        type: Number, // Parts with accuracy > 80%
    }],
    weaknessParts: [{
        type: Number, // Parts with accuracy < 60%
    }],
    skillsAnalysis: [SkillAnalysisSchema],

    // ===================================
    // COMPARISON & PROGRESS
    // ===================================
    improvementFromLastAttempt: {
        type: Number, // +/- points compared to last attempt
        default: 0,
    },
    isPersonalBest: {
        type: Boolean,
        default: false,
    },
    percentileRank: {
        type: Number, // User's rank compared to all attempts (0-100)
        default: 0,
    },

    // ===================================
    // REVIEW & LEARNING
    // ===================================
    wrongQuestions: [{
        type: mongoose.Schema.Types.ObjectId,
        // ID của MỘT CÂU = _id sub-document trong ToeicQuestionSet.
        // Không dùng populate được (ref chỉ khớp _id cấp document);
        // tra cứu qua services/questionSetService.findQuestionsByIds.
        ref: 'ToeicQuestionSet',
    }],
    markedQuestions: [{
        type: mongoose.Schema.Types.ObjectId,
        // ID của MỘT CÂU = _id sub-document trong ToeicQuestionSet.
        // Không dùng populate được (ref chỉ khớp _id cấp document);
        // tra cứu qua services/questionSetService.findQuestionsByIds.
        ref: 'ToeicQuestionSet',
    }],
    hasReviewed: {
        type: Boolean,
        default: false,
    },
    reviewedAt: {
        type: Date,
    },

    // ===================================
    // ACHIEVEMENTS
    // ===================================
    isPerfectPart: [{
        type: Number, // Parts with 100% accuracy
    }],
    speedBonus: {
        type: Number, // Bonus for finishing quickly
        default: 0,
    },

    // ===================================
    // STATUS
    // ===================================
    status: {
        type: String,
        enum: ['in-progress', 'completed', 'abandoned'],
        default: 'in-progress',
        index: true,
    },

    // ===================================
    // REWARDS (if applicable)
    // ===================================
    xpEarned: {
        type: Number,
        default: 0,
    },
    coinsEarned: {
        type: Number,
        default: 0,
    },
    gemsEarned: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
    collection: 'toeic_test_attempts',
});

// ===================================
// INDEXES
// ===================================
// Single-field indexes already declared via `index: true` on userId, testId, status, startedAt.
// Only compound & extra indexes below.
ToeicAttemptSchema.index({ userId: 1, completedAt: -1 });
ToeicAttemptSchema.index({ totalScore: -1 });
ToeicAttemptSchema.index({ createdAt: -1 });

// ===================================
// METHODS
// ===================================

/**
 * Submit answer for a question
 */
ToeicAttemptSchema.methods.submitAnswer = function(answerData) {
    const { questionId, partNumber, userAnswer, correctAnswer, timeSpent, isMarkedForReview } = answerData;

    // Find if answer already exists
    const existingAnswerIndex = this.answers.findIndex(
        a => a.questionId.toString() === questionId.toString()
    );

    const isCorrect = userAnswer === correctAnswer;

    if (existingAnswerIndex >= 0) {
        // Update existing answer
        this.answers[existingAnswerIndex].userAnswer = userAnswer;
        this.answers[existingAnswerIndex].isCorrect = isCorrect;
        this.answers[existingAnswerIndex].timeSpent = timeSpent || 0;
        this.answers[existingAnswerIndex].isMarkedForReview = isMarkedForReview || false;
    } else {
        // Add new answer
        this.answers.push({
            questionId,
            partNumber,
            userAnswer,
            correctAnswer,
            isCorrect,
            timeSpent: timeSpent || 0,
            isMarkedForReview: isMarkedForReview || false,
        });
    }
};

/**
 * Calculate scores and complete the test
 */
ToeicAttemptSchema.methods.calculateScores = async function() {
    // Calculate overall stats
    this.correctAnswers = this.answers.filter(a => a.isCorrect).length;
    this.wrongAnswers = this.answers.filter(a => !a.isCorrect && a.userAnswer).length;
    this.skippedAnswers = this.answers.filter(a => !a.userAnswer).length;
    this.accuracy = this.totalQuestions > 0
        ? Math.round((this.correctAnswers / this.totalQuestions) * 100)
        : 0;

    // Calculate part scores
    const partScoresMap = {};

    for (const answer of this.answers) {
        const part = answer.partNumber;

        if (!partScoresMap[part]) {
            partScoresMap[part] = {
                partNumber: part,
                totalQuestions: 0,
                correctAnswers: 0,
                wrongAnswers: 0,
                skippedAnswers: 0,
                timeSpent: 0,
            };
        }

        partScoresMap[part].totalQuestions += 1;
        partScoresMap[part].timeSpent += answer.timeSpent || 0;

        if (answer.isCorrect) {
            partScoresMap[part].correctAnswers += 1;
        } else if (answer.userAnswer) {
            partScoresMap[part].wrongAnswers += 1;
        } else {
            partScoresMap[part].skippedAnswers += 1;
        }
    }

    this.partScores = Object.values(partScoresMap).map(part => ({
        ...part,
        accuracy: part.totalQuestions > 0
            ? Math.round((part.correctAnswers / part.totalQuestions) * 100)
            : 0,
        timeSpent: Math.round(part.timeSpent / 1000), // Convert to seconds
    }));

    // Import score conversion utility
    const { convertToToeicScore } = require('../utils/toeicScoreConverter');

    // Calculate listening score (Part 1-4)
    const listeningParts = this.partScores.filter(p => p.partNumber <= 4);
    const listeningCorrect = listeningParts.reduce((sum, p) => sum + p.correctAnswers, 0);
    const listeningTotal = listeningParts.reduce((sum, p) => sum + p.totalQuestions, 0);

    // Calculate reading score (Part 5-7)
    const readingParts = this.partScores.filter(p => p.partNumber >= 5);
    const readingCorrect = readingParts.reduce((sum, p) => sum + p.correctAnswers, 0);
    const readingTotal = readingParts.reduce((sum, p) => sum + p.totalQuestions, 0);

    // Convert to TOEIC scores based on test type
    if (this.testType === 'full-test') {
        // Full test: Use standard conversion table (assumes 100 questions per section)
        this.listeningScore = convertToToeicScore('listening', listeningCorrect);
        this.readingScore = convertToToeicScore('reading', readingCorrect);
    } else if (this.testType.startsWith('mini-part')) {
        // Mini test: Scale the score based on percentage
        // For example: Part 1 (6/6) = 100% = 495 points
        if (listeningTotal > 0) {
            const listeningPercentage = (listeningCorrect / listeningTotal) * 100;
            const scaledScore = Math.round((listeningPercentage / 100) * 495);
            // Ensure minimum score of 5
            this.listeningScore = Math.max(5, scaledScore);
        } else {
            this.listeningScore = 5;
        }

        if (readingTotal > 0) {
            const readingPercentage = (readingCorrect / readingTotal) * 100;
            const scaledScore = Math.round((readingPercentage / 100) * 495);
            // Ensure minimum score of 5
            this.readingScore = Math.max(5, scaledScore);
        } else {
            this.readingScore = 5;
        }
    } else {
        // Listening-only or reading-only tests
        if (listeningTotal > 0) {
            const listeningPercentage = (listeningCorrect / listeningTotal) * 100;
            const scaledScore = Math.round((listeningPercentage / 100) * 495);
            this.listeningScore = Math.max(5, scaledScore);
        } else {
            this.listeningScore = 5;
        }

        if (readingTotal > 0) {
            const readingPercentage = (readingCorrect / readingTotal) * 100;
            const scaledScore = Math.round((readingPercentage / 100) * 495);
            this.readingScore = Math.max(5, scaledScore);
        } else {
            this.readingScore = 5;
        }
    }

    this.totalScore = this.listeningScore + this.readingScore;

    // Identify strengths and weaknesses
    this.strengthParts = this.partScores
        .filter(p => p.accuracy >= 80)
        .map(p => p.partNumber);

    this.weaknessParts = this.partScores
        .filter(p => p.accuracy < 60)
        .map(p => p.partNumber);

    // Identify perfect parts
    this.isPerfectPart = this.partScores
        .filter(p => p.accuracy === 100)
        .map(p => p.partNumber);

    // Collect wrong and marked questions
    this.wrongQuestions = this.answers
        .filter(a => !a.isCorrect)
        .map(a => a.questionId);

    this.markedQuestions = this.answers
        .filter(a => a.isMarkedForReview)
        .map(a => a.questionId);

    // Mark as completed
    this.status = 'completed';
    this.completedAt = new Date();
};

/**
 * Pause the test
 */
ToeicAttemptSchema.methods.pauseTest = function() {
    if (!this.isPaused) {
        this.isPaused = true;
        this.pausedTimes.push({ pausedAt: new Date() });
    }
};

/**
 * Resume the test
 */
ToeicAttemptSchema.methods.resumeTest = function() {
    if (this.isPaused && this.pausedTimes.length > 0) {
        const lastPause = this.pausedTimes[this.pausedTimes.length - 1];
        if (!lastPause.resumedAt) {
            lastPause.resumedAt = new Date();
            const pauseDuration = (lastPause.resumedAt - lastPause.pausedAt) / 1000; // seconds
            this.totalPauseDuration += pauseDuration;
        }
        this.isPaused = false;
    }
};

/**
 * Calculate improvement from last attempt
 */
ToeicAttemptSchema.methods.calculateImprovement = async function() {
    const lastAttempt = await this.constructor.findOne({
        userId: this.userId,
        testId: this.testId,
        status: 'completed',
        _id: { $ne: this._id },
    }).sort({ completedAt: -1 });

    if (lastAttempt) {
        this.improvementFromLastAttempt = this.totalScore - lastAttempt.totalScore;
    }

    // Check if this is a personal best
    const bestAttempt = await this.constructor.findOne({
        userId: this.userId,
        testId: this.testId,
        status: 'completed',
        _id: { $ne: this._id },
    }).sort({ totalScore: -1 });

    this.isPersonalBest = !bestAttempt || this.totalScore >= bestAttempt.totalScore;
};

/**
 * Get detailed results
 */
ToeicAttemptSchema.methods.getDetailedResults = function() {
    return {
        attemptId: this._id,
        testName: this.testName,
        testType: this.testType,
        fillBlankMode: this.fillBlankMode,
        startedAt: this.startedAt,
        completedAt: this.completedAt,
        duration: this.duration,
        status: this.status,

        // Overall scores
        scores: {
            listening: this.listeningScore,
            reading: this.readingScore,
            total: this.totalScore,
            accuracy: this.accuracy,
        },

        // Statistics
        stats: {
            totalQuestions: this.totalQuestions,
            correctAnswers: this.correctAnswers,
            wrongAnswers: this.wrongAnswers,
            skippedAnswers: this.skippedAnswers,
        },

        // Part breakdown
        partScores: this.partScores,

        // Analysis
        analysis: {
            strengthParts: this.strengthParts,
            weaknessParts: this.weaknessParts,
            perfectParts: this.isPerfectPart,
            skillsAnalysis: this.skillsAnalysis,
        },

        // Progress
        progress: {
            improvementFromLast: this.improvementFromLastAttempt,
            isPersonalBest: this.isPersonalBest,
            percentileRank: this.percentileRank,
        },

        // Review
        review: {
            wrongQuestionsCount: this.wrongQuestions.length,
            markedQuestionsCount: this.markedQuestions.length,
            hasReviewed: this.hasReviewed,
        },

        // Rewards
        rewards: {
            xp: this.xpEarned,
            coins: this.coinsEarned,
            gems: this.gemsEarned,
        },
    };
};

// ===================================
// STATIC METHODS
// ===================================

/**
 * Get user's test history
 */
ToeicAttemptSchema.statics.getUserHistory = async function(userId, options = {}) {
    const {
        testType,
        limit = 10,
        skip = 0,
        sortBy = '-completedAt',
    } = options;

    const query = {
        userId,
        status: 'completed',
    };

    if (testType) {
        query.testType = testType;
    }

    return await this.find(query)
        .select('-answers') // Exclude detailed answers for listing
        .sort(sortBy)
        .limit(limit)
        .skip(skip)
        .populate('testId', 'testName testType')
        .lean();
};

/**
 * Get user's best score
 */
ToeicAttemptSchema.statics.getUserBestScore = async function(userId, testId = null) {
    const query = {
        userId,
        status: 'completed',
    };

    if (testId) {
        query.testId = testId;
    }

    return await this.findOne(query)
        .sort({ totalScore: -1 })
        .lean();
};

/**
 * Get user's analytics
 */
ToeicAttemptSchema.statics.getUserAnalytics = async function(userId) {
    const stats = await this.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                status: 'completed',
            },
        },
        {
            $group: {
                _id: null,
                totalAttempts: { $sum: 1 },
                averageScore: { $avg: '$totalScore' },
                averageAccuracy: { $avg: '$accuracy' },
                bestScore: { $max: '$totalScore' },
                averageListening: { $avg: '$listeningScore' },
                averageReading: { $avg: '$readingScore' },
                totalXpEarned: { $sum: '$xpEarned' },
                totalCoinsEarned: { $sum: '$coinsEarned' },
            },
        },
    ]);

    if (stats.length === 0) {
        return {
            totalAttempts: 0,
            averageScore: 0,
            averageAccuracy: 0,
            bestScore: 0,
            averageListening: 0,
            averageReading: 0,
            totalXpEarned: 0,
            totalCoinsEarned: 0,
        };
    }

    return {
        ...stats[0],
        averageScore: Math.round(stats[0].averageScore),
        averageAccuracy: Math.round(stats[0].averageAccuracy || 0),
        averageListening: Math.round(stats[0].averageListening),
        averageReading: Math.round(stats[0].averageReading),
    };
};

/**
 * Get score progression
 */
ToeicAttemptSchema.statics.getScoreProgression = async function(userId, limit = 10) {
    return await this.find({
        userId,
        status: 'completed',
    })
    .select('completedAt totalScore listeningScore readingScore testType')
    .sort({ completedAt: 1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('ToeicAttempt', ToeicAttemptSchema);
