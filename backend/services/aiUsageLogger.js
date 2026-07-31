/**
 * Logger cho mỗi lần gọi AI. Cost USD tính theo bảng giá trong aiProviders
 * (nguồn duy nhất, giá niêm yết /1 TRIỆU token như các hãng công bố).
 *
 * Fail-soft: insert DB lỗi cũng không throw — không được làm vỡ tính năng AI
 * chỉ vì log không ghi được.
 */
const AiUsageLog = require('../models/AiUsageLog');
const { calcCost, priceOf, providerOfModel, DEFAULT_PROVIDER } = require('./aiProviders');

/**
 * Log 1 lần gọi AI vào DB.
 * @param {object} opts
 * @param {string} [opts.userId]        Có thể null (admin chạy không context user).
 * @param {string} [opts.feature]       Nhãn chức năng (vd 'vocab-ai-fill').
 * @param {string} [opts.model]
 * @param {string} [opts.provider]      openai | anthropic | deepseek | google.
 *                                      Bỏ trống thì suy ra từ model.
 * @param {object} [opts.usage]         { prompt_tokens, completion_tokens, total_tokens }
 * @param {boolean} [opts.success]
 */
async function logUsage(opts = {}) {
    try {
        const usage = opts.usage || {};
        const prompt = usage.prompt_tokens || 0;
        const completion = usage.completion_tokens || 0;
        const total = usage.total_tokens || (prompt + completion);
        const model = opts.model || 'unknown';
        // Suy provider từ model để chỗ gọi chưa kịp truyền vẫn quy đúng nhà
        // cung cấp trong thống kê.
        const provider = opts.provider || providerOfModel(model) || DEFAULT_PROVIDER;

        await AiUsageLog.create({
            userId: opts.userId || null,
            feature: opts.feature || 'unknown',
            provider,
            model,
            promptTokens: prompt,
            completionTokens: completion,
            totalTokens: total,
            costUsd: calcCost(model, prompt, completion, provider),
            success: opts.success !== false,
        });
    } catch (_) { /* fail-soft */ }
}

module.exports = { logUsage, calcCost, priceOf };
