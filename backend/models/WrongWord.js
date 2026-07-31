const mongoose = require('mongoose');

// Tự xoá từ sai "để yên" quá lâu không tái phạm (đỡ phình DB).
// recordWrong() đẩy expiresAt = now + ngần này ngày mỗi lần sai lại.
const WRONGWORD_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * WrongWord Model - Quản lý từ vựng đã làm sai
 * Sử dụng thuật toán Spaced Repetition (SM-2) để tối ưu việc ôn tập
 */
const WrongWordSchema = new mongoose.Schema({
    // Liên kết với user
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Email người dùng — khoá phân biệt giữa các user (đồng bộ với
    // UserUpload.ownerEmail). userId vẫn giữ cho unique index cũ.
    userEmail: {
        type: String,
        lowercase: true,
        default: null,
        index: true
    },

    // Thông tin từ vựng
    wordId: {
        type: String,
        required: true
    },
    en: {
        type: String,
        required: true
    },
    vn: {
        type: String,
        required: true
    },
    phonetic: String,
    type: String,
    level: String,
    part: String,
    // Nguồn từ vựng (đề/bộ từ) — dùng để phân biệt các nhóm từ sai
    // trong tab "Từ vựng sai". Doc cũ chưa có sẽ gom vào nhóm "khác".
    source: {
        type: String,
        default: '',
        index: true
    },
    example: String,
    image: String,

    // Thống kê lỗi
    wrongCount: {
        type: Number,
        default: 1
    },
    correctCount: {
        type: Number,
        default: 0
    },
    lastWrongAt: {
        type: Date,
        default: Date.now
    },
    lastCorrectAt: {
        type: Date
    },

    // ===================================
    // SPACED REPETITION (SM-2 Algorithm)
    // ===================================

    // Easiness Factor (2.5 mặc định, 1.3-2.5)
    // Càng cao = từ càng dễ nhớ
    easinessFactor: {
        type: Number,
        default: 2.5,
        min: 1.3,
        max: 2.5
    },

    // Interval - số ngày đến lần ôn tiếp theo
    interval: {
        type: Number,
        default: 1 // 1 ngày cho lần đầu
    },

    // Repetition - số lần ôn đúng liên tiếp
    repetition: {
        type: Number,
        default: 0
    },

    // Next Review Date - ngày cần ôn lại
    nextReviewDate: {
        type: Date,
        default: Date.now, // Có thể ôn ngay lập tức
        index: true
    },

    // Review Count - tổng số lần đã ôn
    reviewCount: {
        type: Number,
        default: 0
    },

    // Mastery Level (0-5)
    // 0: Mới sai, 1-2: Khó, 3: Trung bình, 4-5: Đã thuộc
    masteryLevel: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },

    // Priority Score - điểm ưu tiên (càng cao càng cần ôn gấp)
    // Tính dựa trên: wrongCount, thời gian, mastery level
    priorityScore: {
        type: Number,
        default: 100
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'mastered', 'archived'],
        default: 'active',
        index: true
    },

    // Tự xoá khi quá hạn (TTL). null = chưa đặt / không hết hạn.
    expiresAt: {
        type: Date,
        default: null
    },

    // Metadata
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'user_wrongwords',
});

// Compound index cho query hiệu quả
WrongWordSchema.index({ userId: 1, status: 1, nextReviewDate: 1 });
WrongWordSchema.index({ userId: 1, priorityScore: -1 });
WrongWordSchema.index({ userId: 1, wordId: 1 }, { unique: true });
// TTL: doc tự xoá khi now > expiresAt. expiresAt=null không bị xoá.
WrongWordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Cập nhật khi trả lời SAI
 */
WrongWordSchema.methods.recordWrong = function() {
    this.wrongCount += 1;
    this.lastWrongAt = new Date();

    // Reset repetition về 0
    this.repetition = 0;

    // Giảm easiness factor (từ khó nhớ hơn)
    this.easinessFactor = Math.max(1.3, this.easinessFactor - 0.2);

    // Reset interval về 1 ngày
    this.interval = 1;

    // Cập nhật next review date (ôn lại sau 1 ngày)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.nextReviewDate = tomorrow;

    // Giảm mastery level
    this.masteryLevel = Math.max(0, this.masteryLevel - 1);

    // Tăng priority (cần ôn gấp hơn)
    this.calculatePriority();

    this.status = 'active';

    // Gia hạn "vòng đời" mỗi lần tái phạm
    this.expiresAt = new Date(Date.now() + WRONGWORD_TTL_DAYS * DAY_MS);

    this.updatedAt = new Date();
};

/**
 * Cập nhật khi trả lời ĐÚNG
 */
WrongWordSchema.methods.recordCorrect = function() {
    this.correctCount += 1;
    this.lastCorrectAt = new Date();
    this.reviewCount += 1;

    // Tăng repetition
    this.repetition += 1;

    // Tăng easiness factor (từ dễ nhớ hơn)
    this.easinessFactor = Math.min(2.5, this.easinessFactor + 0.1);

    // Tính interval mới theo SM-2
    if (this.repetition === 1) {
        this.interval = 1;
    } else if (this.repetition === 2) {
        this.interval = 6;
    } else {
        this.interval = Math.round(this.interval * this.easinessFactor);
    }

    // Cập nhật next review date
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + this.interval);
    this.nextReviewDate = nextDate;

    // Tăng mastery level
    this.masteryLevel = Math.min(5, this.masteryLevel + 1);

    // Giảm priority (ít cần ôn gấp hơn)
    this.calculatePriority();

    // Nếu đã thuộc (mastery level 5 và 3+ lần đúng liên tiếp)
    if (this.masteryLevel >= 5 && this.repetition >= 3) {
        this.status = 'mastered';
    }

    this.updatedAt = new Date();
};

/**
 * Tính Priority Score
 * Càng cao = càng cần ôn gấp
 */
WrongWordSchema.methods.calculatePriority = function() {
    const now = Date.now();
    const daysSinceWrong = (now - this.lastWrongAt.getTime()) / (1000 * 60 * 60 * 24);
    const daysUntilReview = (this.nextReviewDate.getTime() - now) / (1000 * 60 * 60 * 24);

    // Base score từ số lần sai
    let score = this.wrongCount * 20;

    // Bonus nếu quá hạn ôn tập
    if (daysUntilReview < 0) {
        score += Math.abs(daysUntilReview) * 10;
    }

    // Bonus nếu mới sai gần đây
    if (daysSinceWrong < 3) {
        score += 30;
    }

    // Penalty nếu mastery level cao
    score -= this.masteryLevel * 15;

    // Penalty nếu đã đúng nhiều lần
    score -= this.correctCount * 5;

    this.priorityScore = Math.max(0, Math.round(score));
};

/**
 * Static method: Lấy từ cần ôn theo priority
 */
WrongWordSchema.statics.getWordsToReview = async function(userId, limit = 10) {
    const now = new Date();

    return this.find({
        userId,
        status: 'active',
        nextReviewDate: { $lte: now }
    })
    .sort({ priorityScore: -1, nextReviewDate: 1 })
    .limit(limit);
};

/**
 * Static method: Lấy tất cả từ đang active
 */
WrongWordSchema.statics.getActiveWords = async function(userId, limit = 100) {
    return this.find({
        userId,
        status: 'active'
    })
    .sort({ priorityScore: -1, wrongCount: -1 })
    .limit(limit);
};

/**
 * Static method: Thống kê
 */
WrongWordSchema.statics.getStats = async function(userId) {
    const stats = await this.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                avgWrongCount: { $avg: '$wrongCount' },
                avgMastery: { $avg: '$masteryLevel' }
            }
        }
    ]);

    return stats;
};

const WrongWord = mongoose.model('WrongWord', WrongWordSchema);
WrongWord.TTL_DAYS = WRONGWORD_TTL_DAYS;
module.exports = WrongWord;
