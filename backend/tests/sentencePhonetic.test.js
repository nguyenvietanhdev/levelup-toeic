/**
 * Phiên âm câu ví dụ — IPA (tiếng Anh) và pinyin (tiếng Trung).
 *
 * Chỗ dễ hỏng nhất là `donPhienAm`: model hay trả kèm lời dẫn, hoặc lặp lại câu
 * gốc thay vì phiên âm. Phiên âm SAI còn tệ hơn không có — người học sẽ đọc
 * theo nó, nên thà trả rỗng.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');
const { layPhienAmCau, donPhienAm, coChuHan } = require('../services/sentencePhonetic');

beforeEach(() => chatCompletion.mockReset());

describe('nhận diện ngôn ngữ', () => {
    test('câu có chữ Hán', () => {
        expect(coChuHan('我昨天上班迟到了')).toBe(true);
        expect(coChuHan('New employees must attend training.')).toBe(false);
        expect(coChuHan('')).toBe(false);
    });
});

describe('dọn phiên âm AI trả về', () => {
    test('IPA sạch giữ nguyên', () => {
        expect(donPhienAm('njuː ɪmˈplɔɪiːz', false)).toBe('njuː ɪmˈplɔɪiːz');
    });

    test('gỡ cặp gạch chéo model hay bọc', () => {
        expect(donPhienAm('/njuː ɪmˈplɔɪiːz/', false)).toBe('njuː ɪmˈplɔɪiːz');
    });

    test('gỡ lời dẫn "IPA:"', () => {
        expect(donPhienAm('IPA: njuː ɪmˈplɔɪiːz', false)).toBe('njuː ɪmˈplɔɪiːz');
    });

    test('BỎ chuỗi không có ký tự IPA nào', () => {
        // Model lặp lại câu tiếng Anh thay vì phiên âm — trả nguyên là người
        // học tưởng đó là cách đọc.
        expect(donPhienAm('New employees must attend training.', false)).toBe('');
        expect(donPhienAm('I cannot do that', false)).toBe('');
    });

    test('BỎ chuỗi quá dài — model kèm giải thích', () => {
        expect(donPhienAm('ˈaɪ ' + 'x'.repeat(500), false)).toBe('');
    });

    test('pinyin không đòi ký tự IPA', () => {
        // Pinyin viết bằng chữ Latin có dấu, không có ký hiệu IPA nào.
        expect(donPhienAm('Wǒ zuótiān shàngbān chídàole', true))
            .toBe('Wǒ zuótiān shàngbān chídàole');
    });

    test('đầu vào rác không ném lỗi', () => {
        for (const v of [null, undefined, 42, {}]) {
            expect(() => donPhienAm(v, false)).not.toThrow();
        }
    });
});

describe('gọi AI', () => {
    test('tiếng Anh: yêu cầu IPA, có dấu trọng âm', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: 'ˈtestɪŋ' });
        const r = await layPhienAmCau({ cau: 'Testing here.' });
        expect(r.success).toBe(true);
        expect(r.lang).toBe('en');
        const [msgs] = chatCompletion.mock.calls[0];
        expect(msgs[0].content).toMatch(/IPA/);
        expect(msgs[0].content).toMatch(/stress marks/);
    });

    test('tiếng Trung: yêu cầu pinyin CÓ DẤU THANH', async () => {
        // Pinyin không dấu thì không đọc đúng được, mà sai thanh là sai nghĩa.
        chatCompletion.mockResolvedValueOnce({ success: true, content: 'Wǒ hǎo' });
        const r = await layPhienAmCau({ cau: '我好' });
        expect(r.lang).toBe('zh');
        const [msgs] = chatCompletion.mock.calls[0];
        expect(msgs[0].content).toMatch(/tone marks/);
        expect(msgs[0].content).toMatch(/never tone numbers/);
    });

    test('nhiệt độ 0 — cùng câu phải ra cùng phiên âm', async () => {
        // Phiên âm của một câu là đáp án cố định, không có chỗ cho sáng tạo.
        chatCompletion.mockResolvedValueOnce({ success: true, content: 'ˈtest' });
        await layPhienAmCau({ cau: 'Test.' });
        const [, opts] = chatCompletion.mock.calls[0];
        expect(opts.temperature).toBe(0);
    });

    test('câu rỗng KHÔNG gọi AI', async () => {
        const r = await layPhienAmCau({ cau: '   ' });
        expect(r.success).toBe(false);
        expect(chatCompletion).not.toHaveBeenCalled();
    });

    test('câu quá dài bị chặn TRƯỚC khi gọi AI', async () => {
        // Câu ví dụ thật dài nhất khoảng 30 từ; dài hơn là dữ liệu hỏng hoặc ai
        // đó gửi cả đoạn văn — không được để nó thành hoá đơn token.
        const r = await layPhienAmCau({ cau: 'word '.repeat(100) });
        expect(r.success).toBe(false);
        expect(chatCompletion).not.toHaveBeenCalled();
    });

    test('AI trả rác → thất bại, không trả chuỗi rác', async () => {
        chatCompletion.mockResolvedValueOnce({
            success: true, content: 'Sorry, I cannot help with that.',
        });
        expect((await layPhienAmCau({ cau: 'Test.' })).success).toBe(false);
    });

    test('AI hỏng → trả nguyên lỗi', async () => {
        chatCompletion.mockResolvedValueOnce({ success: false, error: 'timeout' });
        expect((await layPhienAmCau({ cau: 'Test.' })).success).toBe(false);
    });
});

describe('cache và phản hồi', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const ctrl = readFileSync(
        join(__dirname, '..', 'controllers', 'phoneticController.js'), 'utf8');

    test('có cache trong DB thì KHÔNG gọi AI', () => {
        // Câu ví dụ là dữ liệu tĩnh — người thứ hai gặp cùng câu không phải trả
        // tiền lần nữa.
        expect(ctrl.indexOf('daCo?.examplePhonetic'))
            .toBeLessThan(ctrl.indexOf('layPhienAmCau('));
    });

    test('ghi cache cho MỌI bản ghi dùng chung câu đó', () => {
        // Một câu ví dụ có thể gắn với nhiều từ.
        expect(ctrl).toMatch(/updateMany\(\{ example: text \}/);
    });

    test('thất bại trả 200 với phiên âm rỗng, KHÔNG trả 5xx', () => {
        // Đây là thông tin phụ trợ; đẩy lỗi đỏ lên console cho thứ không ảnh
        // hưởng bài học là báo động giả.
        const i = ctrl.indexOf('if (!ai.success)');
        const khoi = ctrl.slice(i, ctrl.indexOf('}', ctrl.indexOf('return', i)));
        expect(khoi).toMatch(/phonetic: ''/);
        expect(khoi).not.toMatch(/status\(5/);
    });

    test('chọn đúng kho theo ngôn ngữ của câu', () => {
        // Câu tiếng Trung nằm ở `VocabularyZh`; tra nhầm kho thì không bao giờ
        // thấy cache và gọi AI lại mỗi lần.
        expect(ctrl).toMatch(/coChuHan\(cau\) \? VocabularyZh : Vocabulary/);
    });
});
