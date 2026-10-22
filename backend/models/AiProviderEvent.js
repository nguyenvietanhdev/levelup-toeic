const mongoose = require('mongoose');

/**
 * Sự kiện một nhà cung cấp AI bị ngừng dùng được (hết credit, sai key).
 *
 * Lưu DB chứ không chỉ trong bộ nhớ: admin phải thấy cảnh báo cả khi server
 * vừa khởi động lại. Mở sự kiện khi hãng vừa rơi vào trạng thái nghỉ, đóng khi
 * một lượt gọi thành công trở lại.
 */
const aiProviderEventSchema = new mongoose.Schema(
    {
        provider: { type: String, required: true, index: true },
        kind: { type: String, enum: ['quota', 'auth'], required: true },
        message: { type: String, default: '' },
        openedAt: { type: Date, default: Date.now },
        // null = còn mở (hãng vẫn không dùng được).
        closedAt: { type: Date, default: null },
    },
    { collection: 'ai_provider_events', versionKey: false },
);

aiProviderEventSchema.index({ provider: 1, closedAt: 1 });
aiProviderEventSchema.index({ openedAt: -1 });

module.exports = mongoose.model('AiProviderEvent', aiProviderEventSchema);
