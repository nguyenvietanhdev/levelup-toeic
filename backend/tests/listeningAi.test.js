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

describe('nghe tiếng Trung: chấm theo từng chữ Hán', () => {
    test('tách: mỗi chữ Hán một đơn vị, bỏ dấu câu; tiếng Anh vẫn theo từ', () => {
        expect(L.tachTu('我很震惊，真的！')).toEqual(['我', '很', '震', '惊', '真', '的']);
        expect(L.tachTu("I'm fine, thanks.")).toEqual(["i'm", 'fine', 'thanks']);
    });

    test('chép đúng hết 100 điểm; thiếu / sai chữ thì thấy đúng chữ nào', () => {
        expect(L.chamNghe('这个消息令人震惊。', '这个消息令人震惊')).toMatchObject({ score: 100, total: 8, correct: 8 });
        const r = L.chamNghe('这个消息令人震惊。', '这个消息让人震京');
        expect(r).toMatchObject({ total: 8, correct: 6, missing: ['令', '惊'], extra: ['让', '京'] });
    });

    test('đoạn tiếng Trung cắt theo ký tự, không theo dấu cách', () => {
        const dai = '你好'.repeat(80);
        expect([...L.lamSachDoan(dai, 'zh')]).toHaveLength(L.MAX_KY_TU_DOAN_ZH);
    });

    test('prompt tiếng Trung: chữ Hán giản thể, cấp HSK, đo bằng chữ, cấm pinyin', async () => {
        mockText.mockResolvedValue({ text: '各位旅客请注意，前往北京的航班开始登机了。', providerId: 'openai' });
        const doan = await L.sinhDoanNghe({ targetWords: ['航班'], level: 'easy', lang: 'zh' });
        expect(doan).toBe('各位旅客请注意，前往北京的航班开始登机了。');
        const p = mockText.mock.calls[0][0].messages[0].content;
        expect(p).toMatch(/Simplified Chinese/);
        expect(p).toMatch(/HSK 1–2/);
        expect(p).toMatch(/at most 60 Chinese characters/);
        expect(p).toMatch(/no pinyin/);
        expect(p).not.toMatch(/CEFR/);
    });

    test('giọng đọc theo ngôn ngữ', () => {
        expect(L.GIONG_THEO_NGON_NGU).toEqual({ en: 'en-US-AriaNeural', zh: 'zh-CN-XiaoxiaoNeural' });
    });

    test('controller: không còn chặn tiếng Trung; lấy từ kho Trung (trường zh); giọng theo phiên', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'controllers', 'listeningController.js'), 'utf8');
        expect(src).not.toMatch(/chỉ có tiếng Anh/);
        expect(src).toMatch(/const lang = st\.vocabLang === 'zh' \? 'zh' : 'en';/);
        // Lấy từ ở service chung `chonTu`: đúng kho theo ngôn ngữ, mặt từ qua faceOf (`zh` trước).
        expect(src).toMatch(/chonTu\(\{\s*userId, email: req\.user\.email, settings: st, lang, soLuong: TU_MUC_TIEU, tiLeYeu: 0\.5,\s*\}\)/);
        const svc = readFileSync(join(__dirname, '..', 'services', 'chonTu.js'), 'utf8');
        expect(svc).toMatch(/lang === 'zh' \? VocabularyZh : Vocabulary/);
        expect(svc).toMatch(/return zh \|\| en;/);
        expect(src).toMatch(/sinhDoanNghe\(\{ targetWords, level, userId, chon, lang \}\)/);
        expect(src).toMatch(/GIONG_THEO_NGON_NGU\[phien\.lang\] \|\| GIONG_NGHE/);
    });
});
