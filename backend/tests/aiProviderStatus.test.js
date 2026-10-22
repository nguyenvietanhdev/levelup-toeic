/**
 * Cảnh báo hết credit cho admin + trạng thái / số dư từng nhà cung cấp.
 *
 * Mock DB (cấu hình, log chi phí, sự kiện) và SDK OpenAI để kiểm tra: sự kiện
 * mở đúng lúc, đóng khi hãng hoạt động lại, số dư đã ghi trừ đúng chi phí, số
 * dư trực tiếp của DeepSeek, và cảnh báo khi hãng chính không dùng được.
 */

const cfgRef = { value: {} };
jest.mock('../models/AiConfig', () => ({
    findOne: () => ({ lean: async () => cfgRef.value }),
}));

const aggregateRef = { total: 0 };
jest.mock('../models/AiUsageLog', () => ({
    aggregate: jest.fn(async () => (aggregateRef.total ? [{ total: aggregateRef.total }] : [])),
}));

const eventRef = { rows: [] };
jest.mock('../models/AiProviderEvent', () => ({
    updateOne: jest.fn(() => Promise.resolve()),
    updateMany: jest.fn(() => Promise.resolve()),
    find: jest.fn(() => ({
        sort: () => ({ limit: () => ({ lean: async () => eventRef.rows }) }),
    })),
}));
const AiProviderEvent = require('../models/AiProviderEvent');

jest.mock('../services/aiUsageLogger', () => ({ logUsage: jest.fn(async () => {}) }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const hang = {};
jest.mock('openai', () => ({
    OpenAI: class {
        constructor({ apiKey }) {
            this.key = apiKey;
            this.chat = { completions: { create: async (args) => hang[this.key].reply(args) } };
        }
    },
}));

const ai = require('../services/aiClient');
const status = require('../services/aiProviderStatus');

const ok = () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
const hetTien = () => Object.assign(new Error('429 You have no credits remaining'), { status: 429 });
const MSG = [{ role: 'user', content: 'hi' }];

beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.GEMINI_API_KEY = 'key-gemini';
    process.env.DEEPSEEK_API_KEY = 'key-deepseek';
    delete process.env.ANTHROPIC_API_KEY;
    cfgRef.value = { provider: 'openai', model: '', overrides: {}, autoFailover: true, fallbacks: [], balances: {} };
    aggregateRef.total = 0;
    eventRef.rows = [];
    AiProviderEvent.updateOne.mockClear();
    AiProviderEvent.updateMany.mockClear();
    ai.clearAiConfigCache();
    ai._resetHealth();
    status._resetLive();
    hang['sk-openai'] = { reply: () => ok() };
    hang['key-gemini'] = { reply: () => ok() };
    hang['key-deepseek'] = { reply: () => ok() };
    // Mặc định: không có API đọc số dư trực tiếp nào trả lời được.
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
});

const tim = (st, id) => st.providers.find(p => p.id === id);

describe('sự kiện cảnh báo hết credit', () => {
    test('hãng hết credit → mở sự kiện (upsert theo "đang mở", không trùng)', async () => {
        hang['sk-openai'].reply = () => { throw hetTien(); };
        await ai.textCompletion({ feature: 'f', messages: MSG });
        expect(AiProviderEvent.updateOne).toHaveBeenCalledWith(
            { provider: 'openai', closedAt: null },
            expect.objectContaining({ $setOnInsert: expect.objectContaining({ kind: 'quota', provider: 'openai' }) }),
            { upsert: true },
        );
    });

    test('lỗi do yêu cầu (400) KHÔNG mở sự kiện', async () => {
        hang['sk-openai'].reply = () => { throw Object.assign(new Error('bad'), { status: 400 }); };
        await ai.textCompletion({ feature: 'f', messages: MSG });
        expect(AiProviderEvent.updateOne).not.toHaveBeenCalled();
    });

    test('hãng hoạt động lại → đóng sự kiện còn mở', async () => {
        hang['sk-openai'].reply = () => { throw hetTien(); };
        await ai.textCompletion({ feature: 'f', messages: MSG });
        // Hãng nạp credit lại: lượt thành công phải đóng sự kiện.
        ai._resetHealth();   // xoá trạng thái nghỉ để lượt sau thử lại openai
        hang['sk-openai'].reply = () => ok();
        AiProviderEvent.updateMany.mockClear();
        await ai.textCompletion({ feature: 'f', messages: MSG });
        expect(AiProviderEvent.updateMany).toHaveBeenCalledWith(
            { provider: 'openai', closedAt: null },
            { $set: { closedAt: expect.any(Date) } },
        );
    });

    test('lần đầu hãng thành công trong tiến trình cũng đóng sự kiện sót từ trước', async () => {
        await ai.textCompletion({ feature: 'f', messages: MSG });
        expect(AiProviderEvent.updateMany).toHaveBeenCalledWith(
            { provider: 'openai', closedAt: null },
            { $set: { closedAt: expect.any(Date) } },
        );
    });
});

describe('số dư', () => {
    test('chưa ghi số dư và không có API → nguồn "none", không đoán', async () => {
        const st = await status.getAiStatus();
        expect(tim(st, 'openai').credit).toMatchObject({ source: 'none', remaining: null, spent: null });
    });

    test('đã ghi số dư → còn = đã ghi − chi phí từ mốc ghi', async () => {
        cfgRef.value.balances = { openai: { balanceUsd: 10, since: new Date('2026-10-01') } };
        aggregateRef.total = 3.25;
        const st = await status.getAiStatus();
        expect(tim(st, 'openai').credit).toMatchObject({ source: 'tracked', currency: 'USD', remaining: 6.75, spent: 3.25 });
    });

    test('số dư còn dưới 2 USD → báo sắp hết nhưng vẫn sẵn sàng', async () => {
        cfgRef.value.balances = { openai: { balanceUsd: 10, since: new Date('2026-10-01') } };
        aggregateRef.total = 9;
        const st = await status.getAiStatus();
        const o = tim(st, 'openai');
        expect(o.credit.lowCredit).toBe(true);
        expect(o.ready).toBe(true);
        expect(o.lyDo).toBe('Sắp hết số dư');
    });

    test('số dư về 0 → KHÔNG sẵn sàng làm dự phòng', async () => {
        cfgRef.value.balances = { google: { balanceUsd: 5, since: new Date('2026-10-01') } };
        aggregateRef.total = 5;
        const st = await status.getAiStatus();
        expect(tim(st, 'google')).toMatchObject({ ready: false, lyDo: 'Hết số dư' });
    });

    test('DeepSeek có API số dư → lấy trực tiếp, nguồn "live", đơn vị theo hãng trả về', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '42.5' }] }),
        }));
        const st = await status.getAiStatus();
        expect(tim(st, 'deepseek').credit).toMatchObject({ source: 'live', currency: 'CNY', remaining: 42.5 });
        expect(global.fetch.mock.calls[0][0]).toBe('https://api.deepseek.com/user/balance');
    });

    test('API số dư lỗi → không làm hỏng trang, rơi về "chưa có số"', async () => {
        global.fetch = jest.fn(async () => { throw new Error('network down'); });
        const st = await status.getAiStatus();
        expect(tim(st, 'deepseek').credit.source).toBe('none');
    });

    test('số dư trực tiếp được cache, không gọi lại API mỗi lần mở tab', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '1' }] }),
        }));
        await status.getAiStatus();
        await status.getAiStatus();
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

describe('cảnh báo tổng', () => {
    test('hãng chính hết credit, hãng dự phòng còn → cảnh báo mức "canh"', async () => {
        hang['sk-openai'].reply = () => { throw hetTien(); };
        await ai.textCompletion({ feature: 'f', messages: MSG });   // openai nghỉ
        const st = await status.getAiStatus();
        expect(st.canhBao).toMatchObject({ muc: 'canh' });
        expect(tim(st, 'openai')).toMatchObject({ ready: false, laChinh: true });
        expect(tim(st, 'openai').lyDo).toMatch(/hết credit/);
    });

    test('mọi hãng không dùng được → cảnh báo nghiêm trọng', async () => {
        delete process.env.GEMINI_API_KEY;
        delete process.env.DEEPSEEK_API_KEY;
        hang['sk-openai'].reply = () => { throw hetTien(); };
        await ai.textCompletion({ feature: 'f', messages: MSG }).catch(() => {});
        const st = await status.getAiStatus();
        expect(st.canhBao).toMatchObject({ muc: 'nghiemtrong' });
    });

    test('mọi thứ bình thường → không có cảnh báo', async () => {
        const st = await status.getAiStatus();
        expect(st.canhBao).toBeNull();
    });

    test('trả về sự kiện đang mở/gần đây cho admin', async () => {
        eventRef.rows = [{ _id: 'abc', provider: 'openai', kind: 'quota', message: 'no credits', openedAt: new Date(), closedAt: null }];
        const st = await status.getAiStatus();
        expect(st.events[0]).toMatchObject({ id: 'abc', provider: 'openai', kind: 'quota', closedAt: null });
    });
});
