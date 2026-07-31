const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        // userId === null nghĩa là thông báo BROADCAST cho mọi user (system).
        // Trước đây admin gửi "tất cả" tạo N copy (1/user) — phình DB. Giờ
        // chỉ tạo 1 doc, frontend phát hiện userId rỗng → hiện cho mọi tài
        // khoản. Khi user xoá → lưu id vào localStorage để ẩn lần sau.
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        type: {
            type: String,
            enum: ['achievement', 'quest', 'system', 'reminder', 'reward', 'test_result', 'level_up', 'violation'],
            required: true,
        },
        title: { type: String, required: true },
        body: { type: String, default: '' },
        // Flexible payload, e.g. { achievementId, testId, levelGained }
        data: { type: mongoose.Schema.Types.Mixed, default: {} },

        // Quà tặng đính kèm thông báo (chỉ dùng cho notif cá nhân userId != null).
        gift: {
            coins: { type: Number, default: 0 },
            gems:  { type: Number, default: 0 },
            xp:    { type: Number, default: 0 },
            // Vật phẩm tặng kèm — [{ itemId, quantity }], grant qua InventoryService khi nhận.
            items: { type: [mongoose.Schema.Types.Mixed], default: [] },
        },
        giftClaimed:   { type: Boolean, default: false },
        giftClaimedAt: { type: Date, default: null },

        read: { type: Boolean, default: false },
        readAt: { type: Date, default: null },

        // Auto-delete after this date (TTL). Notif CÁ NHÂN mặc định 30 ngày.
        // Broadcast (userId=null) khi tạo phải override expiresAt=null để
        // không bị tự xoá — xem adminController.broadcastNotification.
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
    },
    {
        timestamps: true,
        collection: 'notifications',
        versionKey: false,
    }
);

// Newest-first per user
notificationSchema.index({ userId: 1, createdAt: -1 });
// Fast unread count
notificationSchema.index({ userId: 1, read: 1 });
// TTL auto-delete
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
