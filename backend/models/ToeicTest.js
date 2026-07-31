const mongoose = require('mongoose');
const { normalizeSources, sourceMatch } = require('../utils/toeicSource');

const PartConfigSchema = new mongoose.Schema({
    partNumber: {
        type: Number,
        required: true,
        enum: [1, 2, 3, 4, 5, 6, 7],
    },
    // Mỗi phần tử là một MÀN hỏi (ToeicQuestionSet); một màn có thể chứa
    // nhiều câu (Part 3/4/6/7) nên độ dài mảng ≠ số câu — dùng questionsCount.
    questions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ToeicQuestionSet',
    }],
    questionsCount: {
        type: Number,
        required: true,
    },
    timeLimit: {
        type: Number, // in seconds
        required: true,
    },
}, { _id: false });

const ToeicTestSchema = new mongoose.Schema({
    // ===================================
    // BASIC INFO
    // ===================================
    testType: {
        type: String,
        required: [true, 'Test type is required'],
        enum: [
            'full-test',
            'mini-part1',
            'mini-part2',
            'mini-part3',
            'mini-part4',
            'mini-part5',
            'mini-part6',
            'mini-part7',
            'listening-only', // Part 1-4
            'reading-only',   // Part 5-7
        ],
        index: true,
    },
    testName: {
        type: String,
        required: [true, 'Test name is required'],
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },
    // Nguồn đầu tiên — giữ lại cho dữ liệu cũ và cho chỗ hiển thị/lọc một nguồn.
    source: {
        type: String,
        trim: true,
        index: true,
    },
    // Danh sách nguồn để TRỘN câu hỏi (tối đa 3). Rỗng = lấy cả kho.
    // Nguồn sự thật khi bốc câu; `source` luôn bằng sources[0].
    sources: {
        type: [String],
        default: [],
    },
    instructions: {
        type: String,
        trim: true,
    },

    // ===================================
    // TEST CONFIGURATION
    // ===================================
    parts: [PartConfigSchema],
    totalQuestions: {
        type: Number,
        required: true,
    },
    totalTime: {
        type: Number, // Total time in seconds
        required: true,
    },
    randomQuestionCount: {
        type: Number, // Number of random questions to select
        min: 1,
        max: 200,
    },
    allowReuseQuestions: {
        type: Boolean, // (Legacy) Allow selecting questions already used in other tests
        default: false,
    },
    // Chế độ chọn câu khi tạo Mini Test:
    //  default       → theo thứ tự tạo, trong test này
    //  shuffle-same  → đảo câu, cùng test, cùng Part
    //  shuffle-cross → đảo câu, lấy từ mọi test cùng Part
    questionSelectMode: {
        type: String,
        enum: ['default', 'shuffle-same', 'shuffle-cross'],
        default: 'default',
    },

    // ===================================
    // TARGETING
    // ===================================
    targetScoreMin: {
        type: Number, // Minimum target TOEIC score (e.g., 400)
        min: 10,
        max: 990,
    },
    targetScoreMax: {
        type: Number, // Maximum target TOEIC score (e.g., 600)
        min: 10,
        max: 990,
    },
    level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'intermediate',
    },

    // ===================================
    // SCORING CONFIGURATION
    // ===================================
    passingScore: {
        type: Number,
        default: 400, // TOEIC passing score
    },

    // ===================================
    // STATISTICS
    // ===================================
    timesAttempted: {
        type: Number,
        default: 0,
    },
    averageScore: {
        type: Number,
        default: 0,
    },
    averageListeningScore: {
        type: Number,
        default: 0,
    },
    averageReadingScore: {
        type: Number,
        default: 0,
    },
    completionRate: {
        type: Number, // Percentage of people who completed the test
        default: 0,
    },

    // ===================================
    // METADATA
    // ===================================
    tags: [{
        type: String,
        trim: true,
    }],
    category: {
        type: String,
        trim: true,
    },
    version: {
        type: String,
        default: '1.0',
    },

    // ===================================
    // STATUS & ACCESS
    // ===================================
    isPublished: {
        type: Boolean,
        default: false,
        index: true,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    isFree: {
        type: Boolean,
        default: true,
    },
    requiredLevel: {
        type: Number, // User level required to access
        default: 1,
    },
    requiredCoins: {
        type: Number, // Coins needed to unlock
        default: 0,
    },

    // ===================================
    // ADMIN
    // ===================================
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
    collection: 'toeic_tests',
});

// ===================================
// INDEXES
// ===================================
ToeicTestSchema.index({ testType: 1, isPublished: 1, isActive: 1 });
ToeicTestSchema.index({ targetScoreMin: 1, targetScoreMax: 1 });
ToeicTestSchema.index({ createdAt: -1 });

// ===================================
// VIRTUAL FIELDS
// ===================================

/**
 * Get full test info (populate questions)
 */
ToeicTestSchema.virtual('fullInfo').get(function() {
    return {
        id: this._id,
        testName: this.testName,
        testType: this.testType,
        description: this.description,
        totalQuestions: this.totalQuestions,
        totalTime: this.totalTime,
        targetScore: `${this.targetScoreMin}-${this.targetScoreMax}`,
        parts: this.parts,
    };
});

// ===================================
// METHODS
// ===================================

/**
 * Update test statistics
 */
ToeicTestSchema.methods.updateStats = function(attemptData) {
    const { totalScore, listeningScore, readingScore, isCompleted } = attemptData;

    this.timesAttempted += 1;

    // Update average scores
    if (isCompleted) {
        const totalAttempts = this.timesAttempted;
        this.averageScore = Math.round(
            (this.averageScore * (totalAttempts - 1) + totalScore) / totalAttempts
        );
        this.averageListeningScore = Math.round(
            (this.averageListeningScore * (totalAttempts - 1) + listeningScore) / totalAttempts
        );
        this.averageReadingScore = Math.round(
            (this.averageReadingScore * (totalAttempts - 1) + readingScore) / totalAttempts
        );

        // Update completion rate
        const completedAttempts = Math.round(this.completionRate * (totalAttempts - 1) / 100) + 1;
        this.completionRate = Math.round((completedAttempts / totalAttempts) * 100);
    }
};

/**
 * Check if user can access this test
 */
ToeicTestSchema.methods.canUserAccess = function(user) {
    if (!this.isPublished || !this.isActive) {
        return { allowed: false, reason: 'Test is not available' };
    }

    if (user.level < this.requiredLevel) {
        return {
            allowed: false,
            reason: `You need to be level ${this.requiredLevel} to take this test`,
        };
    }

    if (!this.isFree && user.coins < this.requiredCoins) {
        return {
            allowed: false,
            reason: `You need ${this.requiredCoins} coins to unlock this test`,
        };
    }

    return { allowed: true };
};

/**
 * Get test summary for listing
 */
ToeicTestSchema.methods.getSummary = function() {
    return {
        id: this._id,
        testName: this.testName,
        testType: this.testType,
        description: this.description,
        totalQuestions: this.totalQuestions,
        totalTime: this.totalTime,
        targetScoreRange: this.targetScoreMin && this.targetScoreMax
            ? `${this.targetScoreMin}-${this.targetScoreMax}`
            : null,
        level: this.level,
        timesAttempted: this.timesAttempted,
        averageScore: this.averageScore,
        isFree: this.isFree,
        requiredLevel: this.requiredLevel,
        requiredCoins: this.requiredCoins,
        isPublished: this.isPublished,
        createdAt: this.createdAt,
    };
};

// ===================================
// STATIC METHODS
// ===================================

/**
 * Get available tests for user
 */
ToeicTestSchema.statics.getAvailableTests = async function(userLevel) {
    return await this.find({
        isPublished: true,
        isActive: true,
        requiredLevel: { $lte: userLevel },
    })
    .select('-parts.questions') // Exclude question details
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Get test by type
 */
ToeicTestSchema.statics.getByType = async function(testType) {
    return await this.find({
        testType,
        isPublished: true,
        isActive: true,
    })
    .select('-parts.questions')
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Create full-length TOEIC test
 */
ToeicTestSchema.statics.createFullTest = async function(testData) {
    const ToeicQuestionSet = mongoose.model('ToeicQuestionSet');

    const parts = [];
    const partConfigs = [
        { partNumber: 1, questionsCount: 6, timeLimit: 240, partName: 'Photographs' },
        { partNumber: 2, questionsCount: 25, timeLimit: 600, partName: 'Question-Response' },
        { partNumber: 3, questionsCount: 39, timeLimit: 1020, partName: 'Conversations' },
        { partNumber: 4, questionsCount: 30, timeLimit: 900, partName: 'Talks' },
        { partNumber: 5, questionsCount: 30, timeLimit: 720, partName: 'Incomplete Sentences' },
        { partNumber: 6, questionsCount: 16, timeLimit: 480, partName: 'Text Completion' },
        { partNumber: 7, questionsCount: 54, timeLimit: 2040, partName: 'Reading Comprehension' },
    ];

    let totalQuestions = 0;
    let totalTime = 0;

    // Trộn được nhiều nguồn: {} nếu không chọn nguồn nào, $in nếu chọn 2-3.
    const sources = normalizeSources(testData);
    const srcFilter = sourceMatch(sources);

    // Check total available questions first
    // Đếm SỐ CÂU (mỗi màn chứa 1..N câu), không đếm document.
    const countQ = async (filter) => {
        const r = await ToeicQuestionSet.aggregate([
            { $match: filter },
            { $group: { _id: null, n: { $sum: { $size: '$questions' } } } },
        ]);
        return r[0]?.n || 0;
    };

    const totalAvailable = await countQ({
        isActive: true,
        isPublished: true,
        ...srcFilter,
    });

    if (totalAvailable === 0) {
        throw new Error('Cannot generate Full Test: No questions available in the database. Please add questions first.');
    }

    // Get all used question IDs if reuse is not allowed
    let usedQuestionsByPart = {};
    if (testData.allowReuseQuestions === false) {
        const existingTests = await this.find({ isActive: true }).select('parts');
        existingTests.forEach(test => {
            test.parts.forEach(part => {
                if (!usedQuestionsByPart[part.partNumber]) {
                    usedQuestionsByPart[part.partNumber] = [];
                }
                if (part.questions) {
                    usedQuestionsByPart[part.partNumber].push(...part.questions);
                }
            });
        });
    }

    // VALIDATE: Check if we have enough questions for EACH part BEFORE creating the test
    const insufficientParts = [];
    for (const config of partConfigs) {
        let query = {
            part: config.partNumber,
            isActive: true,
            isPublished: true,
        };
        Object.assign(query, srcFilter);

        // If not allowing reuse, exclude already used questions
        if (testData.allowReuseQuestions === false && usedQuestionsByPart[config.partNumber]) {
            query._id = { $nin: usedQuestionsByPart[config.partNumber] };
        }

        const availableCount = await countQ(query);

        if (availableCount < config.questionsCount) {
            insufficientParts.push({
                part: config.partNumber,
                partName: config.partName,
                required: config.questionsCount,
                available: availableCount,
                missing: config.questionsCount - availableCount,
            });
        }
    }

    // If ANY part doesn't have enough questions, throw detailed error
    if (insufficientParts.length > 0) {
        let errorMessage = testData.allowReuseQuestions === false
            ? '⚠️ Cannot generate Full Test: Insufficient unused questions in the following parts:\n\n'
            : '⚠️ Cannot generate Full Test: Insufficient questions in the following parts:\n\n';
        insufficientParts.forEach(p => {
            errorMessage += `• Part ${p.part} (${p.partName}): Need ${p.required}, but only ${p.available} available (missing ${p.missing})\n`;
        });
        errorMessage += testData.allowReuseQuestions === false
            ? '\n💡 Please enable question reuse or add more questions to these parts.'
            : '\n💡 Please add more questions to these parts before creating a Full Test.';

        const error = new Error(errorMessage);
        error.insufficientParts = insufficientParts;
        throw error;
    }

    // All parts have enough questions, proceed to generate test
    for (const config of partConfigs) {
        const excludeIds = (testData.allowReuseQuestions === false && usedQuestionsByPart[config.partNumber])
            ? usedQuestionsByPart[config.partNumber]
            : [];

        // Bốc theo MÀN, gom tới khi đủ số câu — không cắt giữa màn để câu con
        // không bị mồ côi mất ngữ cảnh chung.
        const pool = await ToeicQuestionSet.find({
            part: config.partNumber,
            isActive: true,
            isPublished: true,
            ...srcFilter,
            ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {}),
        }).lean();

        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const chosen = [];
        let picked = 0;
        for (const set of pool) {
            if (picked >= config.questionsCount) break;
            chosen.push(set);
            picked += set.questions.length;
        }

        parts.push({
            partNumber: config.partNumber,
            questions: chosen.map(s => s._id),
            questionsCount: picked,
            timeLimit: config.timeLimit,
        });

        totalQuestions += picked;
        totalTime += config.timeLimit;
    }

    return await this.create({
        testType: 'full-test',
        testName: testData.testName,
        description: testData.description,
        source: sources[0] || null,
        sources,
        parts,
        totalQuestions,
        totalTime,
        targetScoreMin: testData.targetScoreMin || 10,
        targetScoreMax: testData.targetScoreMax || 990,
        isPublished: testData.isPublished || false,
        createdBy: testData.createdBy,
        allowReuseQuestions: testData.allowReuseQuestions || false,
    });
};

module.exports = mongoose.model('ToeicTest', ToeicTestSchema);
