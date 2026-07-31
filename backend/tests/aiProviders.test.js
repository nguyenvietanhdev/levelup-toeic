/**
 * Unit test bảng giá AI.
 *
 * Chốt lại bug đã có: bảng cũ dò tiền tố bằng `.find()` — lấy tiền tố ĐẦU TIÊN
 * khớp, mà 'gpt-4' đứng trước 'gpt-4o-mini' nên mọi lần gọi gpt-4o-mini bị tính
 * theo giá gpt-4, đắt gấp ~200 lần. Test này bắt đúng chỗ đó.
 */
const {
    priceOf, calcCost, providerOfModel, bestPrefix, listProviders,
} = require('../services/aiProviders');

describe('bestPrefix — khớp tiền tố DÀI NHẤT', () => {
    const keys = ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];

    test('không lấy nhầm tiền tố ngắn hơn', () => {
        expect(bestPrefix(keys, 'gpt-4o-mini')).toBe('gpt-4o-mini');
        expect(bestPrefix(keys, 'gpt-4o')).toBe('gpt-4o');
        expect(bestPrefix(keys, 'gpt-4-turbo')).toBe('gpt-4-turbo');
    });

    test('bỏ được hậu tố ngày của model', () => {
        expect(bestPrefix(keys, 'gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini');
    });

    test('không khớp thì trả null', () => {
        expect(bestPrefix(keys, 'llama-3')).toBeNull();
    });
});

describe('priceOf', () => {
    test('gpt-4o-mini KHÔNG bị tính theo giá gpt-4 (bug cũ)', () => {
        const mini = priceOf('gpt-4o-mini');
        const gpt4 = priceOf('gpt-4');
        expect(mini.in).toBe(0.15);
        expect(mini.out).toBe(0.60);
        expect(mini.in).toBeLessThan(gpt4.in);   // 0.15 vs 30.00
    });

    test('đọc được model của mọi nhà cung cấp', () => {
        expect(priceOf('claude-opus-5').in).toBe(5.00);
        expect(priceOf('deepseek-chat').in).toBe(0.27);
        expect(priceOf('gemini-2.0-flash').in).toBe(0.10);
    });

    test('model lạ rơi vào giá mặc định, không phải 0', () => {
        const p = priceOf('mo-hinh-la-hoac');
        expect(p.in).toBeGreaterThan(0);
        expect(p.out).toBeGreaterThan(0);
    });
});

describe('calcCost', () => {
    // Đúng con số trong ảnh người dùng gửi: 14362 prompt + 21 completion.
    const PROMPT = 14362;
    const COMPLETION = 21;

    test('lần quét đáp án thật: ~$0.0022 chứ không phải $0.43', () => {
        const cost = calcCost('gpt-4o-mini', PROMPT, COMPLETION);
        expect(cost).toBeCloseTo(0.002167, 5);
        expect(cost).toBeLessThan(0.01);
    });

    test('giá cũ (nhầm sang gpt-4) đắt hơn ~200 lần', () => {
        const dung = calcCost('gpt-4o-mini', PROMPT, COMPLETION);
        const nhamGpt4 = calcCost('gpt-4', PROMPT, COMPLETION);
        expect(nhamGpt4 / dung).toBeGreaterThan(150);
    });

    test('cộng riêng giá vào và giá ra', () => {
        // 1M token vào + 1M token ra của claude-sonnet-5 = 3 + 15 = 18 USD
        expect(calcCost('claude-sonnet-5', 1e6, 1e6)).toBeCloseTo(18, 6);
    });

    test('0 token → 0 đồng', () => {
        expect(calcCost('gpt-4o-mini', 0, 0)).toBe(0);
    });
});

describe('providerOfModel', () => {
    test('quy đúng model về nhà cung cấp', () => {
        expect(providerOfModel('gpt-4o-mini')).toBe('openai');
        expect(providerOfModel('claude-opus-5')).toBe('anthropic');
        expect(providerOfModel('deepseek-reasoner')).toBe('deepseek');
        expect(providerOfModel('gemini-2.5-pro')).toBe('google');
    });

    test('model lạ → null (để chỗ gọi tự quyết mặc định)', () => {
        expect(providerOfModel('llama-3-70b')).toBeNull();
        expect(providerOfModel('')).toBeNull();
    });
});

describe('listProviders', () => {
    test('liệt kê đủ 4 nhà cung cấp kèm cờ đã cấu hình key', () => {
        const list = listProviders();
        expect(list.map(p => p.id).sort()).toEqual(['anthropic', 'deepseek', 'google', 'openai']);
        list.forEach(p => {
            expect(typeof p.configured).toBe('boolean');
            expect(p.models.length).toBeGreaterThan(0);
            expect(p.models).toContain(p.defaultModel);
        });
    });
});
