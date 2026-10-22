const AiConfig = require('../models/AiConfig');
const { getProvider, DEFAULT_PROVIDER, PROVIDERS } = require('./aiProviders');
const { logUsage } = require('./aiUsageLogger');
const logger = require('../utils/logger');

/**
 * Chọn nhà cung cấp + model cho một tính năng, rồi gọi AI qua đúng SDK.
 *
 * Mọi tính năng AI đi qua đây để: đổi hãng ở admin là áp dụng ngay, mỗi lần
 * gọi đều biết mình thuộc hãng nào, và khi hãng đang dùng lỗi thì TỰ CHUYỂN
 * sang hãng dự phòng (xem `runWithFailover`).
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

/** Nhà cung cấp đã có API key trong .env chưa. */
function apiKeyOf(provider) {
    return process.env[provider.envKey] || '';
}

// ===================================
// PHÂN LOẠI LỖI + TRẠNG THÁI HÃNG
// ===================================

const PHUT = 60 * 1000;

/**
 * Lỗi này nói lên điều gì về HÃNG, và hãng đó nên nghỉ bao lâu.
 *
 * `cooldownMs = 0` nghĩa là lỗi nằm ở yêu cầu (prompt, model), không phải ở hãng:
 * vẫn chuyển sang hãng khác cho lượt này, nhưng không đánh dấu hãng là hỏng.
 */
function classifyError(err) {
    const status = err?.status ?? err?.statusCode;
    const msg = String(err?.message || '');
    if (status === 401 || status === 403) return { kind: 'auth', cooldownMs: 30 * PHUT };
    if (status === 402 || /credit|quota|insufficient|billing|balance/i.test(msg)) {
        return { kind: 'quota', cooldownMs: 30 * PHUT };
    }
    if (status === 429) return { kind: 'rate', cooldownMs: 20 * 1000 };
    if (status === undefined || status >= 500) return { kind: 'server', cooldownMs: 60 * 1000 };
    return { kind: 'request', cooldownMs: 0 };
}

/** providerId → { until, kind, message, at }. Chỉ nằm trong bộ nhớ tiến trình. */
const _nghi = new Map();
/** Các lần đã chuyển hãng gần đây, mới nhất ở cuối (tối đa 20). */
const _chuyen = [];

function markDown(providerId, cls, err) {
    if (!cls.cooldownMs) return;
    const now = Date.now();
    _nghi.set(providerId, {
        until: now + cls.cooldownMs,
        kind: cls.kind,
        message: String(err?.message || '').slice(0, 200),
        at: now,
    });
}

function isDown(providerId) {
    const o = _nghi.get(providerId);
    if (!o) return false;
    if (Date.now() >= o.until) { _nghi.delete(providerId); return false; }
    return true;
}

function recordSwitch(entry) {
    _chuyen.push({ ...entry, at: Date.now() });
    if (_chuyen.length > 20) _chuyen.shift();
}

/** Trạng thái để admin xem: hãng nào đang nghỉ, và lần chuyển gần nhất. */
function healthSnapshot() {
    const now = Date.now();
    const nghi = [];
    for (const [id, o] of _nghi) {
        if (now >= o.until) { _nghi.delete(id); continue; }
        nghi.push({
            provider: id,
            kind: o.kind,
            message: o.message,
            retryInSec: Math.ceil((o.until - now) / 1000),
        });
    }
    return { nghi, chuyen: [..._chuyen].reverse().slice(0, 10) };
}

// ===================================
// CHỌN CHUỖI HÃNG
// ===================================

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

/**
 * Danh sách (hãng, model) sẽ thử theo thứ tự cho `feature`.
 *
 * Hãng chính dùng model đã cấu hình. Hãng dự phòng luôn dùng model mặc định
 * của CHÍNH hãng đó — model của OpenAI không chạy được trên Gemini. Hãng chưa
 * có key bị bỏ, và với đường đọc ảnh thì bỏ hãng không đọc được ảnh.
 */
async function chainFor(feature, { vision = false } = {}) {
    const cfg = await getAiConfig();
    const { provider, model } = await resolveFor(feature);
    const chain = [{ provider, model }];

    if (cfg.autoFailover !== false) {
        const thuTu = cfg.fallbacks?.length ? cfg.fallbacks : Object.keys(PROVIDERS);
        for (const id of thuTu) {
            const p = getProvider(id);
            if (!p || chain.some(a => a.provider.id === p.id)) continue;
            chain.push({ provider: p, model: p.defaultModel });
        }
    }

    return chain.filter(({ provider: p, model: m }) => {
        if (!apiKeyOf(p)) return false;
        if (vision && !(p.vision.length && p.vision.includes(m))) return false;
        return true;
    });
}

// ===================================
// THỰC HIỆN LỜI GỌI + TỰ CHUYỂN
// ===================================

/**
 * Chạy `callOne(provider, model)` theo chuỗi hãng, tự chuyển khi lỗi.
 *
 * Hãng đang nghỉ (vừa hết credit, vừa 5xx...) bị bỏ qua để không trả giá
 * độ trễ ở mỗi lượt. Nếu mọi hãng đều đang nghỉ thì vẫn thử hãng đầu tiên —
 * để hãng vừa hồi phục được phát hiện ngay, không chờ hết thời gian nghỉ.
 */
async function runWithFailover({ feature, userId = null, vision = false }, callOne) {
    const chain = await chainFor(feature, { vision });
    if (!chain.length) {
        const e = new Error(
            'Không có nhà cung cấp AI nào dùng được (chưa có API key, hoặc model không đọc được ảnh). '
            + 'Thêm key vào .env, hoặc đổi nhà cung cấp trong tab "Chi phí AI".',
        );
        e.statusCode = 400;
        throw e;
    }

    const song = chain.filter(a => !isDown(a.provider.id));
    const thuTu = song.length ? song : chain.slice(0, 1);
    const hangChinh = chain[0].provider.id;
    let lastErr;

    for (const { provider, model } of thuTu) {
        try {
            const out = await callOne(provider, model);
            logUsage({ userId, feature, provider: provider.id, model, usage: out.usage, success: true });
            if (provider.id !== hangChinh) {
                recordSwitch({ feature, tu: hangChinh, sang: provider.id });
                logger.warn('AI: đã chuyển sang hãng dự phòng', { feature, tu: hangChinh, sang: provider.id });
            }
            return out;
        } catch (err) {
            lastErr = err;
            const cls = classifyError(err);
            markDown(provider.id, cls, err);
            logUsage({ userId, feature, provider: provider.id, model, usage: {}, success: false });
            logger.error('AI: hãng lỗi', {
                feature, provider: provider.id, model, kind: cls.kind, error: err?.message,
            });
        }
    }
    throw lastErr;
}

// ===================================
// GỌI TỪNG SDK
// ===================================

/** Gửi một lượt tới đúng hãng. Anthropic có hình dạng khác, quy về một dạng chung. */
async function callTextOnce(provider, model, { messages, maxTokens, temperature }) {
    const apiKey = apiKeyOf(provider);

    if (provider.sdk === 'anthropic') {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey });
        // Anthropic tách system ra khỏi danh sách tin nhắn và không nhận role system.
        const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
        const res = await client.messages.create({
            model,
            max_tokens: maxTokens,
            // Anthropic chỉ nhận temperature trong [0, 1].
            temperature: Math.min(temperature, 1),
            ...(system ? { system } : {}),
            messages: messages
                .filter(m => m.role !== 'system')
                .map(m => ({ role: m.role, content: m.content })),
        });
        const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        return {
            text,
            usage: {
                prompt_tokens: res.usage?.input_tokens || 0,
                completion_tokens: res.usage?.output_tokens || 0,
                total_tokens: (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0),
            },
            providerId: provider.id, model,
        };
    }

    const { OpenAI } = require('openai');
    const client = new OpenAI({ apiKey, ...(provider.baseURL ? { baseURL: provider.baseURL } : {}) });
    const res = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
    });
    return {
        text: res.choices?.[0]?.message?.content || '',
        usage: res.usage || {},
        providerId: provider.id, model,
    };
}

/**
 * Chat chữ, có tự chuyển hãng. Trả về { text, usage, providerId, model }.
 * Ném lỗi khi mọi hãng trong chuỗi đều thất bại.
 */
async function textCompletion({ feature, messages, maxTokens = 500, temperature = 0.7, userId = null }) {
    return runWithFailover({ feature, userId }, (provider, model) =>
        callTextOnce(provider, model, { messages, maxTokens, temperature }));
}

/**
 * Gọi model có kèm ẢNH, trả về { text, usage, providerId, model }.
 * Tách riêng vì hai họ SDK có hình dạng request/response khác hẳn nhau.
 *
 * @param {object} opts
 * @param {string} opts.feature     nhãn tính năng (để tra override + ghi log)
 * @param {string} opts.prompt      phần chữ
 * @param {Buffer} opts.imageBuffer ảnh PNG
 * @param {boolean} [opts.json]     ép trả JSON
 */
async function visionCompletion({ feature, prompt, imageBuffer, json = false, maxTokens = 4000, userId = null }) {
    const b64 = imageBuffer.toString('base64');

    return runWithFailover({ feature, userId, vision: true }, async (provider, model) => {
        const apiKey = apiKeyOf(provider);

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
            return {
                text,
                usage: {
                    prompt_tokens: res.usage?.input_tokens || 0,
                    completion_tokens: res.usage?.output_tokens || 0,
                    total_tokens: (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0),
                },
                providerId: provider.id, model,
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
            providerId: provider.id, model,
        };
    });
}

module.exports = {
    getAiConfig,
    clearAiConfigCache,
    resolveFor,
    chainFor,
    classifyError,
    textCompletion,
    visionCompletion,
    healthSnapshot,
    apiKeyOf,
    // Chỉ để test: xoá trạng thái nghỉ của các hãng.
    _resetHealth: () => { _nghi.clear(); _chuyen.length = 0; },
};
