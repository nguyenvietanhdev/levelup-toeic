/**
 * Nghe với AI (TTS): chấm chép lại theo từ, làm sạch đoạn AI trả về, và sinh đoạn
 * nghe (AI được mock).
 */
const mockText = jest.fn();
jest.mock('../services/aiClient', () => ({
    textCompletion: (...a) => mockText(...a),
}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const L = require('../services/listeningAi');

beforeEach(() => mockText.mockReset());

describe('chấm chép lại theo từ', () => {
    test('chép đúng hết thì 100 điểm, không thiếu, không thừa', () => {
        const r = L.chamNghe('I want a coffee.', 'i want a coffee');
        expect(r).toMatchObject({ score: 100, total: 4, correct: 4, missing: [], extra: [] });
    });

    test('bỏ sót một từ: báo đúng từ bị thiếu', () => {
        const r = L.chamNghe('Would you like some tea today?', 'would you like tea today');
        expect(r.missing).toEqual(['some']);
        expect(r.score).toBe(83);   // 5/6 từ đúng
    });

    test('gõ thừa từ: báo từ thừa, không trừ điểm cho phần đúng', () => {
        const r = L.chamNghe('one milk coffee', 'one milk and coffee');
        expect(r.extra).toEqual(['and']);
        expect(r.score).toBe(100);
    });

    test('từ đúng nhưng lệch vị trí vẫn được tính theo chuỗi chung dài nhất', () => {
        const r = L.chamNghe('a b c d', 'd a b c');
        expect(r.correct).toBe(3);
        expect(r.missing).toEqual(['d']);
    });

    test('không phân biệt hoa thường và dấu câu', () => {
        expect(L.chamNghe('Hello, World!', 'hello world').score).toBe(100);
    });

    test('bài rỗng hoặc đoạn gốc rỗng không làm vỡ', () => {
        expect(L.chamNghe('hi there', '').score).toBe(0);
        expect(L.chamNghe('', 'hi').score).toBe(0);
    });

    test('dấu nháy trong từ (don\'t) được giữ nguyên khi so khớp', () => {
        expect(L.chamNghe("I don't know", "i don't know").score).toBe(100);
    });
});

describe('làm sạch đoạn AI trả về', () => {
    test('bỏ dấu nháy bao ngoài và gom khoảng trắng', () => {
        expect(L.lamSachDoan('  "The   bar is open."  ')).toBe('The bar is open.');
    });

    test('đoạn quá dài bị cắt theo trần từ', () => {
        const dai = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ');
        expect(L.lamSachDoan(dai).split(' ')).toHaveLength(L.MAX_WORDS_DOAN);
    });
});

describe('sinh đoạn nghe', () => {
    test('AI viết đoạn → trả về đoạn đã làm sạch; prompt nhận đủ từ mục tiêu và CEFR', async () => {
        mockText.mockResolvedValue({ text: '"The bartender pours two drinks for the guests."', providerId: 'openai' });
        const doan = await L.sinhDoanNghe({ targetWords: ['bartender', 'drink'], level: 'medium', userId: 'u1' });
        expect(doan).toBe('The bartender pours two drinks for the guests.');
        const call = mockText.mock.calls[0][0];
        expect(call.feature).toBe('listening-generate');
        expect(call.messages[0].content).toMatch(/B1–B2/);
        expect(call.messages[1].content).toContain('bartender, drink');
    });

    test('AI trả về quá ngắn → ném lỗi để controller hoàn năng lượng', async () => {
        mockText.mockResolvedValue({ text: 'Hi.', providerId: 'openai' });
        await expect(L.sinhDoanNghe({ targetWords: ['hi'], level: 'easy' })).rejects.toThrow(/quá ngắn/);
    });
});

describe('dạng nghe (một người nói)', () => {
    const { chonDang, phang } = require('../services/dangBai');
    const OK = { text: 'Attention please, flight 204 to Hanoi is now boarding at gate five.', providerId: 'openai' };

    test('kho dạng: khoá không trùng, đủ nhãn, không gợi ý theo kiểu chấm', () => {
        const ds = phang(L.NHOM_DANG_NGHE);
        expect(new Set(ds.map((d) => d.key)).size).toBe(ds.length);
        expect(ds.length).toBeGreaterThanOrEqual(20);
        for (const n of L.NHOM_DANG_NGHE) expect(n.hop).toEqual([]);
        // Không có dạng hội thoại nhiều người: TTS chỉ đọc một giọng.
        expect(ds.map((d) => d.en).join(' ')).not.toMatch(/conversation|dialogue/);
    });

    test('Ngẫu nhiên giữ đoạn đời thường/công sở như trước', async () => {
        mockText.mockResolvedValue(OK);
        await L.sinhDoanNghe({ targetWords: ['gate'], level: 'easy' });
        expect(mockText.mock.calls[0][0].messages[0].content).toMatch(/everyday or workplace situation/);
    });

    test('chọn dạng: đoạn do MỘT người nói theo đúng dạng', async () => {
        mockText.mockResolvedValue(OK);
        await L.sinhDoanNghe({ targetWords: ['gate'], level: 'easy', chon: chonDang(L.NHOM_DANG_NGHE, { dang: 'airport' }) });
        expect(mockText.mock.calls[0][0].messages[0].content).toMatch(/spoken by ONE person, in the form of: airport announcement/);
    });

    test('controller lấy dạng từ body qua chonDang và lưu dang/dangVi', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'controllers', 'listeningController.js'), 'utf8');
        expect(src).toMatch(/chonDang\(NHOM_DANG_NGHE, \{ dang: req\.body\.dang, tuChon: req\.body\.tuChon \}\)/);
        expect(src).toMatch(/dang: chon \? chon\.key : '', dangVi: chon \? chon\.vi : ''/);
    });
});
