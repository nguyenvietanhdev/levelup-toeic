const mongoose = require('mongoose');

/**
 * Một lượt Nghe với AI (TTS). Đoạn gốc được lưu ở server và KHÔNG trả về client
 * (`select: false`): người học chỉ nghe được, không đọc được đoạn thay vì nghe.
 */
const listeningSessionSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        source: { type: String, default: '', trim: true, lowercase: true },
        part: { type: String, default: '', trim: true },
        level: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
        // Các từ mục tiêu đã đưa vào đoạn nghe.
        targetWords: { type: [String], default: [] },
        // Đoạn gốc — ẩn mặc định, chỉ đọc khi chấm.
        passage: { type: String, required: true, select: false },
        status: { type: String, enum: ['open', 'done'], default: 'open', index: true },
        // Bài người học gõ lại và kết quả chấm.
        typed: { type: String, default: '' },
        score: { type: Number, default: 0 },
        reward: {
            xp: { type: Number, default: 0 },
            coins: { type: Number, default: 0 },
            // Chặn cộng thưởng hai lần khi gọi lại chấm.
            claimed: { type: Boolean, default: false },
        },
    },
    { timestamps: true, collection: 'listening_sessions' },
);

module.exports = mongoose.model('ListeningSession', listeningSessionSchema);
