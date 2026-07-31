// ⚠️ MODEL ĐÃ NGHỈ HƯU — KHÔNG dùng trong code chạy nữa.
//
// Thay bằng ToeicQuestionSet (1 document = 1 MÀN hỏi, các câu nằm trong mảng
// questions[]). Toàn bộ controller/service/route đã chuyển sang model mới.
//
// Giữ lại file này CHỈ để các script migration đọc được dữ liệu cũ:
//   scripts/migrateToQuestionSets.js  · scripts/renumberQuestions.js
//   scripts/repairGroupMedia.js       · scripts/imageExtToPng.js
// và để khôi phục từ backups/toeic-*/toeic_questions.json khi cần.
//
// Collection `toeic_questions` vẫn còn trong DB làm lưới an toàn. Xoá khi đã
// chắc chắn:  db.toeic_questions.drop()
// Các script cũ trong scripts/toeic/* cũng chỉ chạy trên model này.

const mongoose = require('mongoose');

const ToeicQuestionSchema = new mongoose.Schema({
    // ===================================
    // ĐỊNH DANH
    // ===================================
    part: {
        type: Number,
        required: [true, 'TOEIC part is required'],
        enum: [1, 2, 3, 4, 5, 6, 7],
        index: true,
    },
    questionNumber: {
        type: Number,
        required: true,
    },

    // Gom nhóm câu hỏi dùng chung audio/passage (Part 3/4/6/7)
    groupId: {
        type: String,
        trim: true,
        index: true,
    },
    // Thứ tự câu trong nhóm: 1, 2, 3...
    questionIndex: {
        type: Number,
        min: 1,
    },
    // Số đoạn văn — chỉ Part 7: 1=single, 2=double, 3=triple
    passageCount: {
        type: Number,
        enum: [1, 2, 3],
    },

    // ===================================
    // HÌNH ẢNH
    // ===================================
    imageUrls: {
        type: [String],
        default: [],
    },

    // ===================================
    // AUDIO — Part 1-4
    // ===================================
    audioUrl: {
        type: String,
        trim: true,
    },
    audioText: {
        type: String, // Script / nội dung audio dạng văn bản
        trim: true,
    },
    audioTranslate: {
        type: String, // Dịch tiếng Việt của audioText
        trim: true,
    },

    // ===================================
    // PASSAGE — Part 6-7
    // ===================================
    passages: {
        type: [String], // Mảng đoạn văn: 1 phần tử (P6/P7 single), 2-3 (P7 double/triple)
        default: [],
    },
    passageTitle: {
        type: String,
        trim: true,
    },
    passageType: {
        type: String, // email / memo / article / advertisement / notice / report / form / chart...
        trim: true,
    },

    // ===================================
    // CÂU HỎI — Part 3-7
    // ===================================
    questionText: {
        type: String,
        trim: true,
    },
    questionTranslate: {
        type: String, // Dịch tiếng Việt của questionText
        trim: true,
    },

    // ===================================
    // ĐÁP ÁN
    // ===================================
    options: [{
        label: {
            type: String,
            required: true,
            enum: ['A', 'B', 'C', 'D'],
        },
        text: {
            type: String,
            required: true,
            trim: true,
        },
        isCorrect: {
            type: Boolean,
            default: false,
        },
    }],
    correctAnswer: {
        type: String,
        required: [true, 'Correct answer is required'],
        enum: ['A', 'B', 'C', 'D'],
    },

    // ===================================
    // GIẢI THÍCH
    // ===================================
    // Object với key A/B/C/D, giải thích tiếng Việt từng lựa chọn
    // { "A": "✅ Đúng vì...", "B": "❌ Sai vì...", ... }
    explanation: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },

    // ===================================
    // METADATA
    // ===================================
    topic: {
        type: String,
        trim: true,
        index: true,
    },
    tags: [{
        type: String,
        trim: true,
    }],
    source: {
        type: String, // "ETS 2024", "Economy TOEIC", v.v.
        trim: true,
        index: true,
    },

    // ===================================
    // THỐNG KÊ
    // ===================================
    timesUsed: {
        type: Number,
        default: 0,
    },
    correctCount: {
        type: Number,
        default: 0,
    },
    wrongCount: {
        type: Number,
        default: 0,
    },
    averageTimeSpent: {
        type: Number, // milliseconds
        default: 0,
    },

    // ===================================
    // TRẠNG THÁI
    // ===================================
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    isPublished: {
        type: Boolean,
        default: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
    collection: 'toeic_questions',
});

// ===================================
// INDEXES
// ===================================
ToeicQuestionSchema.index({ isActive: 1, isPublished: 1 });
ToeicQuestionSchema.index({ part: 1, isActive: 1, isPublished: 1 });
ToeicQuestionSchema.index({ groupId: 1, questionIndex: 1 });
ToeicQuestionSchema.index({ source: 1, part: 1 });

// ===================================
// METHODS
// ===================================

ToeicQuestionSchema.methods.getAccuracy = function () {
    const total = this.correctCount + this.wrongCount;
    if (total === 0) return 0;
    return Math.round((this.correctCount / total) * 100);
};

ToeicQuestionSchema.methods.recordAnswer = function (isCorrect, timeSpent) {
    this.timesUsed += 1;
    if (isCorrect) this.correctCount += 1;
    else this.wrongCount += 1;
    if (timeSpent) {
        const totalTime = this.averageTimeSpent * (this.timesUsed - 1) + timeSpent;
        this.averageTimeSpent = Math.round(totalTime / this.timesUsed);
    }
};

// Trả về câu hỏi đã shuffle options, ẩn correctAnswer và isCorrect (dùng khi làm bài)
ToeicQuestionSchema.methods.getShuffledQuestion = function () {
    const question = this.toObject();
    const options = [...question.options];
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }
    question.options = options;
    delete question.correctAnswer;
    question.options.forEach(opt => delete opt.isCorrect);
    return question;
};

// ===================================
// STATICS
// ===================================

ToeicQuestionSchema.statics.getRandomQuestions = async function (criteria) {
    const { part, count = 10, excludeIds = [], source } = criteria;

    const query = { isActive: true, isPublished: true };
    if (part) query.part = part;
    if (source) query.source = source;
    if (excludeIds.length > 0) query._id = { $nin: excludeIds };

    return await this.aggregate([
        { $match: query },
        { $sample: { size: count } },
    ]);
};

ToeicQuestionSchema.statics.getStatsByPart = async function () {
    return await this.aggregate([
        { $match: { isActive: true, isPublished: true } },
        {
            $group: {
                _id: '$part',
                totalQuestions: { $sum: 1 },
                avgCorrectRate: {
                    $avg: {
                        $cond: [
                            { $eq: [{ $add: ['$correctCount', '$wrongCount'] }, 0] },
                            0,
                            {
                                $multiply: [
                                    { $divide: ['$correctCount', { $add: ['$correctCount', '$wrongCount'] }] },
                                    100,
                                ],
                            },
                        ],
                    },
                },
            },
        },
        { $sort: { _id: 1 } },
    ]);
};

module.exports = mongoose.model('ToeicQuestion', ToeicQuestionSchema);
