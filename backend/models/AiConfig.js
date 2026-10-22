const mongoose = require('mongoose');

/**
 * Cấu hình NHÀ CUNG CẤP AI đang dùng — singleton, admin đổi được trong
 * dashboard mà không phải sửa .env rồi khởi động lại server.
 *
 * API key vẫn nằm trong .env (không bao giờ lưu DB); ở đây chỉ chọn dùng hãng
 * nào + model nào. Đổi hãng là đổi cả giá lẫn chất lượng nên để admin quyết,
 * không hardcode.
 */
const aiConfigSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'default', unique: true },

        // Nhà cung cấp mặc định cho mọi tính năng AI.
        provider: {
            type: String,
            enum: ['openai', 'anthropic', 'deepseek', 'google'],
            default: 'openai',
        },
        model: { type: String, default: '' },   // rỗng = dùng model mặc định của hãng

        // Ghi đè riêng cho từng tính năng, vd:
        //   { 'toeic-question-generate': { provider: 'anthropic', model: 'claude-sonnet-4-5' } }
        // Sinh đề cần model mạnh, trong khi điền từ vựng thì model rẻ là đủ.
        overrides: { type: mongoose.Schema.Types.Mixed, default: {} },

        // Tự chuyển sang hãng khác khi hãng đang dùng lỗi (hết credit, sai key,
        // 5xx, mạng). Bật mặc định: một hãng hết tiền thì tính năng AI không được
        // chết im lặng cho tới khi admin nhớ ra.
        autoFailover: { type: Boolean, default: true },
        // Thứ tự hãng dự phòng. Rỗng = mọi hãng còn lại theo thứ tự danh mục.
        fallbacks: { type: [String], default: [] },

        // Số dư admin đã ghi nhận cho từng hãng, vd:
        //   { openai: { balanceUsd: 20, since: <ngày ghi> } }
        // Số dư còn lại = balanceUsd − chi phí đã ghi log từ `since`. Hãng không
        // có API đọc số dư (OpenAI, Gemini, Anthropic) thì đây là nguồn duy nhất.
        balances: { type: mongoose.Schema.Types.Mixed, default: {} },

        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, collection: 'ai_config' },
);

module.exports = mongoose.model('AiConfig', aiConfigSchema);
