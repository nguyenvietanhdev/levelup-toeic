const AiConfig = require('../models/AiConfig');
const { getProvider, DEFAULT_PROVIDER } = require('./aiProviders');
const logger = require('../utils/logger');

/**
 * Chọn nhà cung cấp + model cho một tính năng, rồi gọi AI qua đúng SDK.
 *
 * Mọi tính năng AI đi qua đây để: đổi hãng ở admin là áp dụng ngay, và mỗi lần
 * gọi đều biết mình thuộc hãng nào (thống kê chi phí mới tách được theo hãng).
 */

// Cache 30s — cấu hình đổi rất ít, tránh truy DB mỗi lần gọi AI.
let _cache = null;
let _at = 0;

async function getAiConfig() {
    if (_cache && Date.now() - _at < 30000) return _cache;
    _cache = (await AiConfig.findOne({ key: 'default' }).lean())
        || { provider: DEFAULT_PROVIDER, model: '', overrides: {} };
    _at = Date.now();
    return _cache;
}

function clearAiConfigCache() { _cache = null; _at = 0; }

/**
 * Nhà cung cấp + model dùng cho `feature`: ưu tiên override riêng của tính năng,
 * sau đó tới cấu hình chung, cuối cùng là mặc định của hãng.
 */
async function resolveFor(feature) {
    const cfg = await getAiConfig();
    const ov = (cfg.overrides || {})[feature] || {};
    const providerId = ov.provider || cfg.provider || DEFAULT_PROVIDER;
    const provider = getProvider(providerId) || getProvider(DEFAULT_PROVIDER);
    const model = ov.model || (ov.provider ? '' : cfg.model) || provider.defaultModel;
    return { provider, providerId: provider.id, model };
}

/** Nhà cung cấp đã có API key trong .env chưa. */
function apiKeyOf(provider) {
    return process.env[provider.envKey] || '';
}

/**
 * Gọi model có kèm ẢNH, trả về { text, usage, providerId, model }.
 * Tách riêng vì hai họ SDK có hình dạng request/response khác hẳn nhau —
 * gộp chung sẽ thành một mớ if/else khó đọc ở mọi chỗ gọi.
 *
 * @param {object} opts
 * @param {string} opts.feature     nhãn tính năng (để tra override + ghi log)
 * @param {string} opts.prompt      phần chữ
 * @param {Buffer} opts.imageBuffer ảnh PNG
 * @param {boolean} [opts.json]     ép trả JSON
 */
async function visionCompletion({ feature, prompt, imageBuffer, json = false, maxTokens = 4000 }) {
    const { provider, providerId, model } = await resolveFor(feature);
    const apiKey = apiKeyOf(provider);
    if (!apiKey) {
        const e = new Error(
            `Chưa cấu hình ${provider.envKey} nên không dùng được ${provider.label}. `
            + 'Thêm key vào .env, hoặc đổi nhà cung cấp trong tab "Chi phí AI".',
        );
        e.statusCode = 400;
        throw e;
    }
    if (provider.vision.length && !provider.vision.includes(model)) {
        const e = new Error(
            `Model "${model}" của ${provider.label} không đọc được ảnh. `
            + `Chọn một trong: ${provider.vision.join(', ')}.`,
        );
        e.statusCode = 400;
        throw e;
    }

    const b64 = imageBuffer.toString('base64');
    logger.info('Gọi AI kèm ảnh', { feature, provider: providerId, model });

    if (provider.sdk === 'anthropic') {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey });
        const res = await client.messages.create({
            model,
            max_tokens: maxTokens,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
                    { type: 'text', text: prompt },
                ],
            }],
        });
        const text = (res.content || [])
            .filter(b => b.type === 'text').map(b => b.text).join('');
        // Anthropic đặt tên field khác OpenAI — quy về một dạng để chỗ gọi
        // và logger không phải biết mình đang nói chuyện với hãng nào.
        return {
            text,
            usage: {
                prompt_tokens: res.usage?.input_tokens || 0,
                completion_tokens: res.usage?.output_tokens || 0,
                total_tokens: (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0),
            },
            providerId, model,
        };
    }

    // OpenAI và mọi hãng dùng API tương thích OpenAI (DeepSeek, Gemini).
    const { OpenAI } = require('openai');
    const client = new OpenAI({ apiKey, ...(provider.baseURL ? { baseURL: provider.baseURL } : {}) });
    const res = await client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' } },
            ],
        }],
    });
    return {
        text: res.choices?.[0]?.message?.content || '',
        usage: res.usage || {},
        providerId, model,
    };
}

module.exports = { getAiConfig, clearAiConfigCache, resolveFor, visionCompletion, apiKeyOf };
