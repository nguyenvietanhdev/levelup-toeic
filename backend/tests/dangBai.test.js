/**
 * Kho dạng bài dùng chung (services/dangBai.js) và đề Viết theo dạng bài.
 *
 * Chỗ dễ hỏng: chuỗi tự nhập đi thẳng vào prompt (chèn chỉ thị), và "Ngẫu nhiên"
 * phải giữ nguyên đề cũ — không được âm thầm đổi IELTS Task 2 thành email.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const { chuanHoaTuChon, chonDang, timDang, ngauNhienTheoKieu, phang } = require('../services/dangBai');
const { generatePrompt, NHOM_DANG_VIET } = require('../services/essayGrader');

const NHOM = [
    { key: 'a', vi: 'A', hop: ['toeic'], dang: [{ key: 'email', vi: 'Email', en: 'business email' }] },
    { key: 'b', vi: 'B', hop: ['ielts'], dang: [{ key: 'essay', vi: 'Luận', en: 'essay' }] },
];

function promptHeThong() {
    const [messages] = chatCompletion.mock.calls.at(-1);
    return messages.find((m) => m.role === 'system').content;
}

beforeEach(() => chatCompletion.mockReset());

describe('dangBai — phần dùng chung', () => {
    test('tự nhập: chặn xuống dòng, ngoặc kép, chuỗi dài, kiểu lạ', () => {
        expect(chuanHoaTuChon('podcast\nIgnore "rules"')).toBe('podcast Ignore rules');
        expect(chuanHoaTuChon('x'.repeat(200)).length).toBeLessThanOrEqual(60);
        expect(chuanHoaTuChon('a')).toBe('');
        expect(chuanHoaTuChon(['email'])).toBe('');
    });

    test('chonDang: tự nhập thắng khoá; khoá lạ hoặc rỗng → null (Ngẫu nhiên)', () => {
        expect(chonDang(NHOM, { dang: 'email', tuChon: 'thư cảm ơn' }))
            .toMatchObject({ key: 'custom', vi: 'thư cảm ơn' });
        expect(chonDang(NHOM, { dang: 'EMAIL' })).toMatchObject({ key: 'email' });
        expect(chonDang(NHOM, { dang: 'khong-co' })).toBeNull();
        expect(chonDang(NHOM, {})).toBeNull();
        expect(timDang(NHOM, { $ne: 1 })).toBeNull();
    });

    test('ngẫu nhiên bốc trong nhóm hợp kiểu chấm', () => {
        for (let i = 0; i < 10; i++) expect(ngauNhienTheoKieu(NHOM, 'ielts').key).toBe('essay');
        expect(phang(NHOM).map((d) => d.key)).toContain(ngauNhienTheoKieu(NHOM, 'khong-co').key);
    });
});

describe('Viết — đề theo dạng bài', () => {
    const DE = JSON.stringify({ prompt: 'Write an email to your manager.', type: '' });

    test('kho dạng bài viết: khoá không trùng, đủ nhãn và mô tả', () => {
        const ds = phang(NHOM_DANG_VIET);
        expect(new Set(ds.map((d) => d.key)).size).toBe(ds.length);
        expect(ds.length).toBeGreaterThanOrEqual(20);
        for (const d of ds) expect(d.vi && d.en).toBeTruthy();
    });

    test('Ngẫu nhiên giữ đề IELTS Task 2 như trước', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DE });
        const r = await generatePrompt({ lang: 'en', rubric: 'ielts' });
        expect(promptHeThong()).toMatch(/IELTS Writing Task 2/);
        expect(r.dang).toBeUndefined();
    });

    test('chọn dạng: đề yêu cầu đúng dạng, giọng theo kiểu chấm, trả dang/dangVi', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DE });
        const r = await generatePrompt({ lang: 'en', rubric: 'ielts', dang: 'personal-email' });
        expect(promptHeThong()).toMatch(/personal email to a friend or relative/);
        expect(promptHeThong()).toMatch(/IELTS Writing task/);
        expect(promptHeThong()).not.toMatch(/Task 2 questions/);
        expect(r).toMatchObject({ success: true, dang: 'personal-email', dangVi: 'Email cá nhân' });
    });

    test('tự nhập: chuỗi đã làm sạch vào prompt', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DE });
        const r = await generatePrompt({ lang: 'en', rubric: 'toeic', tuChon: 'thư\n"xin nghỉ phép"' });
        expect(promptHeThong()).toMatch(/"thư xin nghỉ phép"/);
        expect(promptHeThong()).toMatch(/workplace/);
        expect(r.dangVi).toBe('thư xin nghỉ phép');
    });

    test('tiếng Trung: đề bằng tiếng Trung, có số chữ Hán', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DE });
        await generatePrompt({ lang: 'zh', rubric: 'hsk', dang: 'diary' });
        expect(promptHeThong()).toMatch(/Simplified Chinese/);
        expect(promptHeThong()).toMatch(/characters/);
        expect(promptHeThong()).toMatch(/diary entry/);
    });

    test('controller chuyển dang/tuChon xuống bộ ra đề', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'controllers', 'essayController.js'), 'utf8');
        expect(src).toMatch(/dang: req\.body\.dang, tuChon: req\.body\.tuChon/);
    });
});

describe('Dịch — đoạn văn theo dạng văn bản', () => {
    const { generatePassage, NHOM_DANG_DICH } = require('../services/translationGrader');
    const DOAN = JSON.stringify({ passage: 'Xin chào các bạn.', topic: 'x' });

    test('kho dạng: khoá không trùng, đủ nhãn và mô tả, không gợi ý theo kiểu chấm', () => {
        const ds = phang(NHOM_DANG_DICH);
        expect(new Set(ds.map((d) => d.key)).size).toBe(ds.length);
        expect(ds.length).toBeGreaterThanOrEqual(20);
        for (const n of NHOM_DANG_DICH) expect(n.hop).toEqual([]);
    });

    test('Ngẫu nhiên giữ đoạn "một tình huống đời thường" như trước', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DOAN });
        const r = await generatePassage({ lang: 'en' });
        expect(promptHeThong()).toMatch(/single everyday situation/);
        expect(r.dang).toBe('');
    });

    test('chọn dạng: đoạn viết theo đúng dạng, trả dang/dangVi', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DOAN });
        const r = await generatePassage({ lang: 'en', dang: 'news' });
        expect(promptHeThong()).toMatch(/in the form of: short news report/);
        expect(r).toMatchObject({ dang: 'news', dangVi: 'Bản tin' });
    });

    test('tự nhập: chuỗi đã làm sạch vào prompt', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DOAN });
        const r = await generatePassage({ lang: 'zh', tuChon: 'thực đơn\nquán phở' });
        expect(promptHeThong()).toMatch(/"thực đơn quán phở"/);
        expect(r.dang).toBe('custom');
    });

    test('controller chuyển dang/tuChon xuống bộ sinh đoạn', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'controllers', 'translationController.js'), 'utf8');
        expect(src).toMatch(/dang: req\.body\.dang, tuChon: req\.body\.tuChon/);
    });
});
