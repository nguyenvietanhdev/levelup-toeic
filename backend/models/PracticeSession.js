const mongoose = require('mongoose');

const PracticeSessionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    mode: {
        type: String,
        required: true,
        enum: ['multiple-choice', 'fill-blank', 'listening', 'matching', 'word-scramble', 'speed-quiz', 'flashcard', 'synonym-check', 'word-type-check'],
    },
    questionsCount: {
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
    score: {
        type: Number,
        default: 0,
    },
    duration: {
        type: Number, // in seconds
        default: 0,
    },
    isPerfect: {
        type: Boolean,
        default: false,
    },
    energyUsed: {
        type: Number,
        default: 0,
    },
    xpEarned: {
        type: Number,
        default: 0,
    },
    coinsEarned: {
        type: Number,
        default: 0,
    },
    wordsLearned: [{
        type: String,
    }],
    answers: [{
        wordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vocabulary',
        },
        word: String,
        userAnswer: String,
        correctAnswer: String,
        isCorrect: Boolean,
        timeSpent: Number, // milliseconds
    }],
    completedAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
    collection: 'user_practice_sessions',
});

// Indexes
PracticeSessionSchema.index({ user: 1, completedAt: -1 });
PracticeSessionSchema.index({ mode: 1 });
PracticeSessionSchema.index({ score: -1 });

/**
 * Calculate accuracy
 */
PracticeSessionSchema.methods.getAccuracy = function() {
    const total = this.correctAnswers + this.wrongAnswers;
    if (total === 0) return 0;
    return Math.round((this.correctAnswers / total) * 100);
};

/**
 * Get performance rating
 */
PracticeSessionSchema.methods.getPerformance = function() {
    const accuracy = this.getAccuracy();
    
    if (accuracy === 100) return 'PERFECT';
    if (accuracy >= 90) return 'EXCELLENT';
    if (accuracy >= 80) return 'GREAT';
    if (accuracy >= 70) return 'GOOD';
    if (accuracy >= 60) return 'PASS';
    return 'FAIL';
};

/**
 * Static method: Get user statistics
 */
PracticeSessionSchema.statics.getUserStats = async function(userId) {
    const stats = await this.aggregate([
        { $match: { user: mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: null,
                totalSessions: { $sum: 1 },
                totalCorrect: { $sum: '$correctAnswers' },
                totalWrong: { $sum: '$wrongAnswers' },
                totalScore: { $sum: '$score' },
                highestScore: { $max: '$score' },
                perfectSessions: {
                    $sum: { $cond: ['$isPerfect', 1, 0] }
                },
                totalXP: { $sum: '$xpEarned' },
                totalCoins: { $sum: '$coinsEarned' },
                avgDuration: { $avg: '$duration' },
            }
        }
    ]);

    if (stats.length === 0) {
        return {
            totalSessions: 0,
            totalCorrect: 0,
            totalWrong: 0,
            accuracy: 0,
            totalScore: 0,
            highestScore: 0,
            perfectSessions: 0,
            totalXP: 0,
            totalCoins: 0,
            avgDuration: 0,
        };
    }

    const result = stats[0];
    const total = result.totalCorrect + result.totalWrong;
    result.accuracy = total > 0 ? Math.round((result.totalCorrect / total) * 100) : 0;
    
    return result;
};

/**
 * Static method: Get mode statistics
 */
PracticeSessionSchema.statics.getModeStats = async function(userId) {
    return await this.aggregate([
        { $match: { user: mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$mode',
                played: { $sum: 1 },
                totalScore: { $sum: '$score' },
                highestScore: { $max: '$score' },
                correctAnswers: { $sum: '$correctAnswers' },
                wrongAnswers: { $sum: '$wrongAnswers' },
            }
        },
        {
            $project: {
                mode: '$_id',
                played: 1,
                totalScore: 1,
                highestScore: 1,
                accuracy: {
                    $cond: [
                        { $eq: [{ $add: ['$correctAnswers', '$wrongAnswers'] }, 0] },
                        0,
                        {
                            $multiply: [
                                { $divide: ['$correctAnswers', { $add: ['$correctAnswers', '$wrongAnswers'] }] },
                                100
                            ]
                        }
                    ]
                }
            }
        }
    ]);
};

module.exports = mongoose.model('PracticeSession', PracticeSessionSchema);