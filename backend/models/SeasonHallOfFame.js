const mongoose = require('mongoose');

/**
 * Bảng vinh danh (Hall of Fame) — snapshot top người chơi của một mùa NGAY TRƯỚC
 * khi reset. Mỗi mùa kết thúc tạo 1 bản ghi.
 */
const hofSchema = new mongoose.Schema(
    {
        seasonNumber: { type: Number, required: true, index: true },
        startAt: { type: Date },
        endedAt: { type: Date, default: Date.now },
        topUsers: [
            {
                rank: Number,
                email: String,
                username: String,
                level: Number,
                xp: Number,
                totalXp: Number,
                coins: Number,
                gems: Number,
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model('SeasonHallOfFame', hofSchema);
