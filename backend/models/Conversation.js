const mongoose = require('mongoose');

// Phiên bỏ dở tự dọn sau 7 ngày. Người học mở hội thoại rồi đóng tab là chuyện
// thường; không có TTL thì DB đầy phiên `active` không bao giờ xong.
// Phiên ĐÃ XONG không hết hạn — nó là lịch sử học tập, người dùng xem lại được.
const ABANDONED_TTL_DAYS = 7;

const turnSchema = new mongoose.Schema(
    {
        // 'npc' = máy nói, 'user' = người học đáp.
        //
        // Phân biệt này KHÔNG chỉ để hiển thị: `collectUsed` chỉ tính từ trong
        // lượt của người học. Tính cả lượt NPC thì AI tự nói hết danh sách là
        // người học được điểm tối đa mà chưa gõ chữ nào.
        role: { type: String, enum: ['npc', 'user'], required: true },
        content: { type: String, required: true },
        // Từ mục tiêu mà LƯỢT NÀY dùng được — lưu sẵn để khỏi tính lại khi xem
        // lịch sử, và để hiện đúng câu nào ăn điểm.
        matched: { type: [String], default: [] },
        at: { type: Date, default: Date.now },
    },
    { _id: false }
);

const conversationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        // Bộ từ đang luyện — cùng cặp (source, part) với popup Chọn Part.
        source: { type: String, required: true, trim: true },
        part: { type: String, default: '', trim: true },
        lang: { type: String, enum: ['en', 'zh'], default: 'en' },

        // Chủ đề hội thoại, do AI đặt lúc mở phiên (vd "đi chợ", "hỏi đường").
        topic: { type: String, default: '' },

        /**
         * Danh sách từ người học CẦN dùng.
         *
         * Chốt NGAY lúc mở phiên, không tính lại về sau: kho từ vựng có thể đổi
         * giữa chừng (admin thêm/xoá từ), mà đổi mục tiêu khi phiên đang chạy
         * thì người học dùng đúng từ vẫn trượt.
         */
        targetWords: { type: [String], default: [] },

        /**
         * Từ đã dùng được — NGUỒN DUY NHẤT để tính thưởng.
         *
         * Server tính lại từ `turns` sau mỗi lượt. Client cũng tự chấm để tô
         * sáng ngay cho mượt, nhưng con số ăn thưởng KHÔNG lấy từ client: sửa
         * được request là sửa được thưởng. Cùng nguyên tắc với năng lượng và XP.
         */
        usedWords: { type: [String], default: [] },

        turns: { type: [turnSchema], default: [] },

        status: {
            type: String,
            enum: ['active', 'done', 'abandoned'],
            default: 'active',
            index: true,
        },

        reward: {
            xp: { type: Number, default: 0 },
            coins: { type: Number, default: 0 },
            // Chặn nhận thưởng HAI LẦN. Thiếu cờ này thì gọi lại endpoint
            // `finish` là cộng tiếp — lỗ hổng kinh điển của mọi màn "nhận quà".
            claimed: { type: Boolean, default: false },
        },

        // Chỉ đặt cho phiên BỎ DỞ (xem TTL ở trên). Phiên xong = null → không
        // bao giờ bị xoá.
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + ABANDONED_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
    },
    {
        timestamps: true,
        collection: 'conversations',
        versionKey: false,
    }
);

// Mở màn "phiên đang dở của tôi" — truy vấn hay dùng nhất.
conversationSchema.index({ userId: 1, status: 1, updatedAt: -1 });

// TTL: Mongo tự xoá khi `expiresAt` tới hạn. Doc có `expiresAt: null` được BỎ
// QUA (đúng ý: phiên đã xong thì giữ lại làm lịch sử).
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Conversation', conversationSchema);
module.exports.ABANDONED_TTL_DAYS = ABANDONED_TTL_DAYS;
