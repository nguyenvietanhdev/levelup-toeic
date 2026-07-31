const mongoose = require('mongoose');

/**
 * AiUsageLog — log MỖI lần gọi OpenAI từ admin/backend để theo dõi token.
 * Cho phép breakdown theo feature (vocab-ai-fill, question-generate, …),
 * theo user, theo ngày để hiển thị trong tab Token Management.
 */
const aiUsageLogSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        // Nhãn chức năng — phân loại trong UI. Để 'unknown' nếu caller quên set.
        feature: { type: String, default: 'unknown', index: true },
        // Nhà cung cấp AI — tách khỏi model để thống kê chi phí theo từng hãng
        // (một hãng có nhiều model, và model có thể trùng tên giữa các hãng).
        provider: { type: String, default: 'openai', index: true },
        model: { type: String, default: 'unknown' },
        promptTokens: { type: Number, default: 0 },
        completionTokens: { type: Number, default: 0 },
        totalTokens: { type: Number, default: 0 },
        costUsd: { type: Number, default: 0 },     // ước tính USD theo bảng giá
        success: { type: Boolean, default: true },
    },
    { timestamps: true, collection: 'ai_usage_log', versionKey: false }
);

aiUsageLogSchema.index({ createdAt: -1 });
aiUsageLogSchema.index({ feature: 1, createdAt: -1 });
aiUsageLogSchema.index({ provider: 1, createdAt: -1 });

module.exports = mongoose.model('AiUsageLog', aiUsageLogSchema);
