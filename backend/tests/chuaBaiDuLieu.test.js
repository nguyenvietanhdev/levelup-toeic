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

describe('bài nhiều lỗi không làm câu trả lời bị cắt cụt', () => {
    // Bộ đo eval/chamViet: chấm bài yếu dùng đúng 1400/1400 token rồi dừng giữa danh sách lỗi
    // → JSON hỏng → "AI trả về kết quả chấm không đọc được", 3/3 lần.
    test.each([
        ['IELTS', { lang: 'en' }],
        ['HSK', { lang: 'zh' }],
        ['Giao tiếp', { lang: 'en', rubric: 'giaotiep' }],
        ['TOEIC', { lang: 'en', rubric: 'toeic' }],
    ])('%s: giới hạn số lỗi trong prompt, trần token đủ rộng', async (_ten, opt) => {
        aiTraVe([]);
        await gradeEssay({ prompt: 'p', essay: 'e', ...opt });
        expect(heThong()).toMatch(/List at most 12 errors, the most important first/);
        expect(chatCompletion.mock.calls.at(-1)[1].maxTokens).toBeGreaterThanOrEqual(3000);
    });
});
