/**
 * Danh mục NHÀ CUNG CẤP AI — nguồn duy nhất cho model, bảng giá và cách gọi.
 *
 * Thêm nhà cung cấp mới = thêm một mục ở đây, không phải sửa rải rác trong
 * controller. Giá tính theo USD / 1 TRIỆU token (đúng cách các hãng niêm yết)
 * thay vì /1K như bảng cũ — /1K dễ nhầm dấu phẩy khi cập nhật giá.
 */

const PROVIDERS = {
    openai: {
        id: 'openai',
        label: 'OpenAI',
        envKey: 'OPENAI_API_KEY',
        // SDK openai dùng chung cho mọi nhà cung cấp "OpenAI-compatible".
        sdk: 'openai',
        baseURL: null, // mặc định của SDK
        models: {
            'gpt-4o':        { in: 2.50, out: 10.00 },
            'gpt-4o-mini':   { in: 0.15, out: 0.60 },
            'gpt-4-turbo':   { in: 10.00, out: 30.00 },
            'gpt-4':         { in: 30.00, out: 60.00 },
            'gpt-3.5-turbo': { in: 0.50, out: 1.50 },
        },
        defaultModel: 'gpt-4o-mini',
        vision: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    },

    anthropic: {
        id: 'anthropic',
        label: 'Anthropic (Claude)',
        envKey: 'ANTHROPIC_API_KEY',
        sdk: 'anthropic',
        baseURL: null,
        models: {
            'claude-opus-5':   { in: 5.00, out: 25.00 },
            'claude-sonnet-5': { in: 3.00, out: 15.00 },
            'claude-haiku-4-5': { in: 1.00, out: 5.00 },
        },
        defaultModel: 'claude-sonnet-5',
        vision: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
    },

    deepseek: {
        id: 'deepseek',
        label: 'DeepSeek',
        envKey: 'DEEPSEEK_API_KEY',
        sdk: 'openai',                       // API tương thích OpenAI
        baseURL: 'https://api.deepseek.com',
        models: {
            'deepseek-chat':     { in: 0.27, out: 1.10 },
            'deepseek-reasoner': { in: 0.55, out: 2.19 },
        },
        defaultModel: 'deepseek-chat',
        vision: [],                          // chưa hỗ trợ đọc ảnh
    },

    google: {
        id: 'google',
        label: 'Google (Gemini)',
        envKey: 'GEMINI_API_KEY',
        sdk: 'openai',                       // Gemini có endpoint tương thích OpenAI
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        models: {
            'gemini-2.0-flash':      { in: 0.10, out: 0.40 },
            'gemini-2.5-flash':      { in: 0.30, out: 2.50 },
            'gemini-2.5-pro':        { in: 1.25, out: 10.00 },
        },
        defaultModel: 'gemini-2.0-flash',
        vision: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    },
};

const DEFAULT_PROVIDER = 'openai';

/** Giá mặc định khi gặp model lạ — ước tính an toàn, không để cost = 0. */
const FALLBACK_PRICE = { in: 2.00, out: 6.00 };

function listProviders() {
    return Object.values(PROVIDERS).map(p => ({
        id: p.id,
        label: p.label,
        envKey: p.envKey,
        configured: !!process.env[p.envKey],   // đã có API key chưa
        models: Object.keys(p.models),
        defaultModel: p.defaultModel,
        vision: p.vision,
    }));
}

function getProvider(id) {
    return PROVIDERS[id] || null;
}

/** Nhà cung cấp nào sở hữu model này (dùng cho log cũ chưa ghi provider). */
function providerOfModel(model) {
    if (!model) return null;
    for (const p of Object.values(PROVIDERS)) {
        if (p.models[model]) return p.id;
        // Model có hậu tố ngày (gpt-4o-mini-2024-07-18) → khớp tiền tố DÀI NHẤT.
        const hit = bestPrefix(Object.keys(p.models), model);
        if (hit) return p.id;
    }
    return null;
}

/**
 * Khớp tiền tố DÀI NHẤT, không phải tiền tố đầu tiên tìm thấy.
 * Đây chính là chỗ bảng giá cũ tính sai: 'gpt-4o-mini' bắt đầu bằng 'gpt-4'
 * nên rơi vào giá gpt-4 — đắt gấp 200 lần giá thật.
 */
function bestPrefix(keys, model) {
    let best = null;
    for (const k of keys) {
        if (model.startsWith(k) && (!best || k.length > best.length)) best = k;
    }
    return best;
}

/** Giá {in, out} USD/1M token của một model. */
function priceOf(model, providerId) {
    const providers = providerId && PROVIDERS[providerId]
        ? [PROVIDERS[providerId]]
        : Object.values(PROVIDERS);
    for (const p of providers) {
        if (p.models[model]) return p.models[model];
        const hit = bestPrefix(Object.keys(p.models), model);
        if (hit) return p.models[hit];
    }
    return FALLBACK_PRICE;
}

/** Chi phí USD cho một lần gọi. */
function calcCost(model, promptTokens, completionTokens, providerId) {
    const { in: pin, out: pout } = priceOf(model, providerId);
    return ((promptTokens / 1e6) * pin) + ((completionTokens / 1e6) * pout);
}

module.exports = {
    PROVIDERS,
    DEFAULT_PROVIDER,
    listProviders,
    getProvider,
    providerOfModel,
    priceOf,
    calcCost,
    bestPrefix,
};
