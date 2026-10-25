/**
 * Dữ liệu cho giao diện CHỮA BÀI (bút đỏ trên chính bài làm) — phần Viết.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. `fix` viết bằng tiếng Việt (lời giải thích) → không ghép được bản "Đã sửa",
 *      người học tự sửa xong không có gì để so.
 *   2. Mất `muc` → mọi lỗi cùng một màu, không phân biệt "sai" với "nên sửa".
 *   3. AI ghi mức lạ → lỗi bị coi nhẹ thành "nên sửa".
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');
const { gradeEssay } = require('../services/essayGrader');
const { chiThiChuaBai, chuanHoaMuc } = require('../services/errorTaxonomy');

const heThong = () => chatCompletion.mock.calls.at(-1)[0].find((m) => m.role === 'system').content;

function aiTraVe(errors) {
    chatCompletion.mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
            scores: { taskResponse: 6, coherence: 6, lexical: 6, grammar: 6 },
            errors, strengths: [], improved: '',
        }),
    });
}

describe('mức độ lỗi', () => {
    test('style → nen; error, lạ, thiếu → loi', () => {
        expect(chuanHoaMuc('style')).toBe('nen');
        expect(chuanHoaMuc('error')).toBe('loi');
        expect(chuanHoaMuc('STYLE!')).toBe('loi');
        expect(chuanHoaMuc(undefined)).toBe('loi');
    });

    test('chấm bài gắn `muc` vào từng lỗi', async () => {
        aiTraVe([
            { quote: 'I goes', issue: 'Sai hoà hợp', fix: 'I go', type: 'agreement', level: 'error' },
            { quote: 'very big', issue: 'Chưa tự nhiên', fix: 'huge', type: 'word-choice', level: 'style' },
        ]);
        const r = await gradeEssay({ prompt: 'p', essay: 'I goes to a very big city.' });
        expect(r.result.errors.map((e) => e.muc)).toEqual(['loi', 'nen']);
    });
});

describe('prompt: cụm sửa là chữ THAY THẾ, cùng ngôn ngữ với bài', () => {
    test.each([
        ['IELTS', { lang: 'en' }, 'English'],
        ['HSK', { lang: 'zh' }, 'CHINESE'],
        ['Giao tiếp', { lang: 'en', rubric: 'giaotiep' }, 'ENGLISH'],
    ])('%s', async (_ten, opt, ngonNgu) => {
        aiTraVe([]);
        await gradeEssay({ prompt: 'p', essay: 'e', ...opt });
        const p = heThong();
        // `fix` KHÔNG còn nằm trong danh sách viết bằng tiếng Việt.
        expect(p).toMatch(/Write every comment, issue and strength in VIETNAMESE\./);
        expect(p).toContain(`Keep "quote", "fix" and "improved" in ${ngonNgu}`);
        expect(p).toContain(chiThiChuaBai('fix'));
    });
});
