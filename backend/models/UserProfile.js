const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
    {
        // Audio
        soundEnabled: { type: Boolean, default: true },
        soundEffects: { type: Boolean, default: true },
        volume: { type: Number, default: 70, min: 0, max: 100 },
        autoPronunciation: { type: Boolean, default: false },

        // Game
        randomQuestions: { type: Boolean, default: false },
        questionsPerSession: { type: mongoose.Schema.Types.Mixed, default: 10 },
        timePerQuestion: { type: Number, default: 30 },
        // Mục tiêu thời gian học mỗi ngày (phút) — vòng tiến độ ở trang chủ.
        dailyStudyGoalMin: { type: Number, default: 15 },
        // Mục tiêu điểm TOEIC (0 = chưa đặt). Thang thật 10–990, bước 5.
        // Phần phân tích lấy con số này để đối chiếu với điểm ước lượng.
        toeicTargetScore: { type: Number, default: 0, min: 0, max: 990 },
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard', 'adaptive'],
            default: 'medium',
        },

        // Features
        notificationsEnabled: { type: Boolean, default: true },
        autoSync: { type: Boolean, default: true },
    },
    { _id: false }
);

const userProfileSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            maxlength: 20,
        },
        displayName: { type: String, trim: true, default: '' },
        // Lần đổi tên gần nhất — giới hạn 1 lần / 30 ngày. null = chưa từng đổi.
        usernameChangedAt: { type: Date, default: null },
        avatar: {
            type: String,
            default: function () {
                return (this.username || '?').charAt(0).toUpperCase();
            },
        },

        level: { type: Number, default: 1 },
        currentLevelXp: { type: Number, default: 0 },

        // Cosmetic đang trang bị theo slot: { background: itemId, frame: itemId, ... }
        equipped: { type: mongoose.Schema.Types.Mixed, default: {} },

        // Số lượt like nhận được (denormalized để hiện nhanh ở BXH/popup).
        likeCount: { type: Number, default: 0 },

        settings: { type: settingsSchema, default: () => ({}) },
    },
    {
        timestamps: true,
        collection: 'user_profiles',
        versionKey: false,
    }
);

module.exports = mongoose.model('UserProfile', userProfileSchema);
