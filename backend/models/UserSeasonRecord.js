const mongoose = require('mongoose');

/**
 * Thành tích CÁ NHÂN của một user trong một mùa — snapshot ngay TRƯỚC khi reset.
 * Khác SeasonHallOfFame (chỉ top 10 toàn server): bảng này lưu cho MỌI người chơi
 * để ai cũng xem lại được hành trình của mình ở tab Hồ sơ, dù không vào top.
 */
const userSeasonRecordSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        seasonNumber: { type: Number, required: true },

        level: { type: Number, default: 1 },
        totalXp: { type: Number, default: 0 },
        rank: { type: Number, default: null },   // hạng theo totalXp (null nếu không xếp được)

        wordsLearned: { type: Number, default: 0 },
        totalSessions: { type: Number, default: 0 },
        correctAnswers: { type: Number, default: 0 },
        wrongAnswers: { type: Number, default: 0 },
        accuracy: { type: Number, default: 0 },  // %
        perfectRounds: { type: Number, default: 0 },
        streakLongest: { type: Number, default: 0 },
        totalPlayTime: { type: Number, default: 0 }, // giây
        achievementsUnlocked: { type: Number, default: 0 },

        startAt: { type: Date },
        endedAt: { type: Date, default: Date.now },
    },
    { timestamps: true, collection: 'user_season_records' }
);

// Mỗi user chỉ 1 bản ghi / mùa (chạy reset 2 lần không tạo trùng).
userSeasonRecordSchema.index({ userId: 1, seasonNumber: 1 }, { unique: true });
userSeasonRecordSchema.index({ userId: 1, seasonNumber: -1 });

module.exports = mongoose.model('UserSeasonRecord', userSeasonRecordSchema);
