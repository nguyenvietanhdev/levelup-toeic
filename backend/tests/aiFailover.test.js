/**
 * Tự chuyển nhà cung cấp AI khi hãng đang dùng lỗi.
 *
 * Mock SDK OpenAI (mọi hãng OpenAI-compatible đều đi qua nó) để điều khiển
 * từng hãng thành công hay thất bại, rồi kiểm tra: chọn đúng chuỗi hãng, chuyển
 * khi lỗi, bỏ qua hãng đang nghỉ, và không chuyển khi đã tắt.
 */

const cfgRef = { value: {} };
jest.mock('../models/AiConfig', () => ({
    findOne: () => ({ lean: async () => cfgRef.value }),
}));

const logUsageMock = jest.fn(async () => {});
jest.mock('../services/aiUsageLogger', () => ({ logUsage: (...a) => logUsageMock(...a) }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

// Mỗi hãng (theo API key) có một hàm trả lời riêng, đếm số lần được gọi.
const hang = {};
jest.mock('openai', () => ({
    OpenAI: class {
        constructor({ apiKey }) {
            this.key = apiKey;
            this.chat = {
                completions: {
                    create: async (args) => {
                        hang[this.key].calls += 1;
                        return hang[this.key].reply(args);
                    },
                },
            };
        }
    },
}));

const ai = require('../services/aiClient');

const ok = (text) => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
const hetTien = () => Object.assign(new Error('429 You have no credits remaining'), { status: 429 });

function setHang(apiKey, reply) {
    hang[apiKey] = { calls: 0, reply };
}

beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.GEMINI_API_KEY = 'key-gemini';
    process.env.DEEPSEEK_API_KEY = 'key-deepseek';
    delete process.env.ANTHROPIC_API_KEY;
    cfgRef.value = { provider: 'openai', model: '', overrides: {}, autoFailover: true, fallbacks: [] };
    ai.clearAiConfigCache();
    ai._resetHealth();
    logUsageMock.mockClear();
    for (const k of Object.keys(hang)) delete hang[k];
    setHang('sk-openai', () => ok('from-openai'));
    setHang('key-gemini', () => ok('from-gemini'));
    setHang('key-deepseek', () => ok('from-deepseek'));
});

const MSG = [{ role: 'user', content: 'hi' }];

describe('phân loại lỗi', () => {
    test('hết credit → nghỉ 30 phút', () => {
        expect(ai.classifyError(hetTien())).toMatchObject({ kind: 'quota', cooldownMs: 30 * 60 * 1000 });
    });
    test('429 thường → chỉ nghỉ ngắn', () => {
        expect(ai.classifyError({ status: 429, message: 'rate limit' })).toMatchObject({ kind: 'rate', cooldownMs: 20000 });
    });
    test('sai key (401/403) → nghỉ 30 phút', () => {
        expect(ai.classifyError({ status: 401, message: 'bad key' })).toMatchObject({ kind: 'auth', cooldownMs: 30 * 60 * 1000 });
    });
    test('5xx và lỗi mạng (không có status) → server', () => {
        expect(ai.classifyError({ status: 503 })).toMatchObject({ kind: 'server' });
        expect(ai.classifyError(new Error('socket hang up'))).toMatchObject({ kind: 'server' });
    });
    test('400 là lỗi yêu cầu, KHÔNG đánh dấu hãng hỏng', () => {
        expect(ai.classifyError({ status: 400, message: 'bad request' })).toMatchObject({ kind: 'request', cooldownMs: 0 });
    });
});

describe('chuỗi hãng', () => {
    test('hãng chính đứng đầu, các hãng dự phòng theo thứ tự danh mục', async () => {
        const chain = await ai.chainFor('f');
        expect(chain.map(a => a.provider.id)).toEqual(['openai', 'deepseek', 'google']);
    });

    test('hãng dự phòng dùng model mặc định của CHÍNH hãng đó', async () => {
        const chain = await ai.chainFor('f');
        expect(chain.find(a => a.provider.id === 'google').model).toBe('gemini-2.0-flash');
        expect(chain.find(a => a.provider.id === 'openai').model).not.toBe('gemini-2.0-flash');
    });

    test('danh sách dự phòng tường minh thì chỉ dùng đúng các hãng đó', async () => {
        cfgRef.value = { ...cfgRef.value, fallbacks: ['deepseek'] };
        ai.clearAiConfigCache();
        const chain = await ai.chainFor('f');
        expect(chain.map(a => a.provider.id)).toEqual(['openai', 'deepseek']);
    });

    test('hãng chưa có key bị bỏ', async () => {
        delete process.env.GEMINI_API_KEY;
        const chain = await ai.chainFor('f');
        expect(chain.map(a => a.provider.id)).toEqual(['openai', 'deepseek']);
    });

    test('đọc ảnh: loại hãng không có model đọc được ảnh (DeepSeek)', async () => {
        const chain = await ai.chainFor('f', { vision: true });
        expect(chain.map(a => a.provider.id)).not.toContain('deepseek');
    });

    test('tắt tự chuyển thì chỉ còn hãng chính', async () => {
        cfgRef.value = { ...cfgRef.value, autoFailover: false };
        ai.clearAiConfigCache();
        const chain = await ai.chainFor('f');
        expect(chain.map(a => a.provider.id)).toEqual(['openai']);
    });
});

describe('textCompletion tự chuyển hãng', () => {
    test('hãng chính hết credit → trả lời bằng hãng dự phòng', async () => {
        setHang('sk-openai', () => { throw hetTien(); });
        const out = await ai.textCompletion({ feature: 'essay-prompt', messages: MSG });
        expect(out.text).toBe('from-deepseek');
        expect(out.providerId).toBe('deepseek');
    });

    test('ghi log usage: hãng lỗi ghi success=false, hãng thay thế ghi success=true', async () => {
        setHang('sk-openai', () => { throw hetTien(); });
        await ai.textCompletion({ feature: 'essay-prompt', messages: MSG, userId: 'u1' });
        const calls = logUsageMock.mock.calls.map(c => c[0]);
        expect(calls).toContainEqual(expect.objectContaining({ provider: 'openai', success: false, userId: 'u1' }));
        expect(calls).toContainEqual(expect.objectContaining({ provider: 'deepseek', success: true, userId: 'u1' }));
    });

    test('hãng bị hết credit được ĐÁNH DẤU nghỉ: lượt sau bỏ qua, không gọi lại', async () => {
        setHang('sk-openai', () => { throw hetTien(); });
        await ai.textCompletion({ feature: 'f', messages: MSG });
        const lanDau = hang['sk-openai'].calls;
        await ai.textCompletion({ feature: 'f', messages: MSG });
        expect(hang['sk-openai'].calls).toBe(lanDau);
        const h = ai.healthSnapshot();
        expect(h.nghi.map(n => n.provider)).toContain('openai');
    });

    test('lỗi do yêu cầu (400) vẫn chuyển cho lượt này nhưng KHÔNG đánh dấu hãng nghỉ', async () => {
        setHang('sk-openai', () => { throw Object.assign(new Error('bad prompt'), { status: 400 }); });
        const out = await ai.textCompletion({ feature: 'f', messages: MSG });
        expect(out.providerId).toBe('deepseek');
        expect(ai.healthSnapshot().nghi.map(n => n.provider)).not.toContain('openai');
    });

    test('ghi nhận lần chuyển hãng để admin xem', async () => {
        setHang('sk-openai', () => { throw hetTien(); });
        await ai.textCompletion({ feature: 'conversation-open', messages: MSG });
        const { chuyen } = ai.healthSnapshot();
        expect(chuyen[0]).toMatchObject({ feature: 'conversation-open', tu: 'openai', sang: 'deepseek' });
    });

    test('tắt tự chuyển → hãng chính lỗi thì ném lỗi, không gọi hãng khác', async () => {
        cfgRef.value = { ...cfgRef.value, autoFailover: false };
        ai.clearAiConfigCache();
        setHang('sk-openai', () => { throw hetTien(); });
        await expect(ai.textCompletion({ feature: 'f', messages: MSG })).rejects.toThrow(/credit/);
        expect(hang['key-gemini'].calls).toBe(0);
    });

    test('mọi hãng đều lỗi → ném lỗi cuối cùng', async () => {
        setHang('sk-openai', () => { throw hetTien(); });
        setHang('key-gemini', () => { throw Object.assign(new Error('gemini down'), { status: 503 }); });
        setHang('key-deepseek', () => { throw Object.assign(new Error('ds down'), { status: 503 }); });
        await expect(ai.textCompletion({ feature: 'f', messages: MSG })).rejects.toThrow(/gemini down/);
    });

    test('mọi hãng đang nghỉ → vẫn thử hãng chính để phát hiện hồi phục', async () => {
        const hetHang = () => { throw hetTien(); };
        setHang('sk-openai', hetHang);
        setHang('key-gemini', hetHang);
        setHang('key-deepseek', hetHang);
        await expect(ai.textCompletion({ feature: 'f', messages: MSG })).rejects.toThrow();
        // Cả ba đều đang nghỉ. openai vừa nạp lại credit: lượt sau phải thử nó ngay.
        setHang('sk-openai', () => ok('openai-back'));
        const out = await ai.textCompletion({ feature: 'f', messages: MSG });
        expect(out.text).toBe('openai-back');
    });
});

describe('config/openai.chatCompletion giữ đúng hình dạng trả về cho các chỗ gọi cũ', () => {
    test('thành công: { success, content, usage }', async () => {
        const { chatCompletion } = require('../config/openai');
        const r = await chatCompletion(MSG, { feature: 'x' });
        expect(r).toMatchObject({ success: true, content: 'from-openai' });
    });

    test('thất bại toàn bộ: { success:false, error } — không ném', async () => {
        setHang('sk-openai', () => { throw hetTien(); });
        setHang('key-gemini', () => { throw hetTien(); });
        setHang('key-deepseek', () => { throw hetTien(); });
        const { chatCompletion } = require('../config/openai');
        const r = await chatCompletion(MSG, { feature: 'x' });
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/credit/);
    });
});
