/**
 * Tách từ ghép thành chữ Hán đơn — bước đầu tiên của chế độ luyện viết.
 *
 * Vì sao đáng test riêng: luyện viết `你好` không có nghĩa, phải luyện `你` rồi
 * `好`. Mà dữ liệu thật lẫn nhiều thứ không phải chữ Hán — dấu câu Trung
 * (，。！), chữ Latin trong ví dụ, khoảng trắng. Lọt một ký tự không phải Hán là
 * `fetch('/hanzi/，.json')` trả 404 và màn hình trắng.
 */
import { describe, test, expect, vi } from 'vitest';
import { splitHanzi, HanziWriting } from './hanziWriting.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';

describe('splitHanzi', () => {
    test('tách từ ghép thành từng chữ', () => {
        expect(splitHanzi('你好')).toEqual(['你', '好']);
        expect(splitHanzi('早上好')).toEqual(['早', '上', '好']);
    });

    test('chữ đơn giữ nguyên', () => {
        expect(splitHanzi('好')).toEqual(['好']);
    });

    test('LOẠI dấu câu Trung — nếu lọt sẽ tải file không tồn tại', () => {
        // Câu ví dụ trong DB có dạng "你好，我是越南人。"
        expect(splitHanzi('你好，我是越南人。')).toEqual(
            ['你', '好', '我', '是', '越', '南', '人']
        );
    });

    test('LOẠI chữ Latin, số và khoảng trắng', () => {
        expect(splitHanzi('好 good 123')).toEqual(['好']);
        expect(splitHanzi('HSK1 学')).toEqual(['学']);
    });

    test('đầu vào rỗng hoặc không hợp lệ trả mảng rỗng, không ném lỗi', () => {
        expect(splitHanzi('')).toEqual([]);
        expect(splitHanzi(null)).toEqual([]);
        expect(splitHanzi(undefined)).toEqual([]);
        expect(splitHanzi('abc')).toEqual([]);
    });

    test('giữ nguyên thứ tự xuất hiện', () => {
        // Thứ tự quan trọng: người học viết theo thứ tự chữ trong từ.
        expect(splitHanzi('中国人')).toEqual(['中', '国', '人']);
    });
});

/**
 * MỘT CÂU HỎI = MỘT TỪ, không phải một chữ.
 *
 * Bản đầu tôi tách mỗi chữ thành một câu riêng. Người học thấy pinyin "nǐ hǎo"
 * và nghĩa "Xin chào" nhưng chỉ được viết mỗi chữ `你` — mất luôn mối liên hệ
 * giữa mặt chữ và cái từ họ đang học, mà nhìn màn hình thì không thấy sai ở đâu.
 */
describe('generateQuestions — một câu là trọn một từ', () => {
    async function gen(words, config = {}) {
        vi.spyOn(PartSelector, 'getWordsForPractice').mockResolvedValue(words);
        const mode = Object.create(HanziWriting);
        mode.config = config;
        await mode.generateQuestions();
        return mode.questions;
    }

    test('từ nhiều chữ nằm TRỌN trong một câu, không bị xé lẻ', async () => {
        const qs = await gen([{ zh: '你好', phonetic: 'nǐ hǎo', vn: 'Xin chào' }]);
        expect(qs).toHaveLength(1);           // một từ → một câu, không phải hai
        expect(qs[0].word).toBe('你好');
        expect(qs[0].chars).toEqual(['你', '好']);
    });

    test('giữ pinyin từ key `phonetic` — KHÔNG phải key `pinyin`', async () => {
        // Dữ liệu thật lưu pinyin trong `phonetic`; đọc nhầm key thì mọi câu hiện
        // pinyin rỗng mà không có lỗi nào.
        const qs = await gen([{ zh: '学', phonetic: 'xué', vn: 'học' }]);
        expect(qs[0].pinyin).toBe('xué');
        expect(qs[0].meaning).toBe('học');
    });

    test('bỏ từ không có chữ Hán nào thay vì tạo câu rỗng', async () => {
        const qs = await gen([
            { zh: 'hello', phonetic: '', vn: 'xin chào' },
            { zh: '好', phonetic: 'hǎo', vn: 'tốt' },
        ]);
        expect(qs.map(q => q.word)).toEqual(['好']);
    });

    test('cắt đúng số câu mỗi lượt', async () => {
        const words = ['一', '二', '三', '四', '五'].map(z => ({ zh: z, phonetic: '', vn: '' }));
        const qs = await gen(words, { questionsPerRound: 3 });
        expect(qs).toHaveLength(3);
    });

    test('nguồn từ hỏng trả mảng rỗng, không ném lỗi', async () => {
        expect(await gen(null)).toEqual([]);
    });
});

/**
 * "Xem mẫu" phải MỞ LẠI quiz sau khi diễn xong.
 *
 * Lỗi đã gặp: `animateCharacter()` huỷ quiz đang chạy (hành vi của thư viện).
 * Bấm Xem mẫu xong là không tô tiếp được — chữ vẫn hiện, chuột vẫn di, nhưng
 * không nét nào ăn và không có lỗi nào trong console. Bài luyện chết đứng mà
 * nhìn màn hình thì mọi thứ trông bình thường.
 */
describe('showDemo — diễn xong phải mở lại quiz', () => {
    function stub({ autoComplete = true } = {}) {
        const mode = Object.create(HanziWriting);
        mode.questions = [{ word: '品牌', chars: ['品', '牌'], pinyin: 'pǐnpái', meaning: 'Thương hiệu' }];
        mode.currentIndex = 0;
        mode.charIndex = 1;
        mode.strokeNum = 4;
        mode._demoing = false;
        mode.quizCalls = [];
        mode.writer = {
            quiz: (opts) => mode.quizCalls.push(opts),
            animateCharacter: (opts) => { if (autoComplete) opts?.onComplete?.(); },
        };
        return mode;
    }

    test('mở lại quiz sau khi diễn xong', () => {
        const mode = stub();
        mode.showDemo();
        expect(mode.quizCalls).toHaveLength(1);
    });

    test('mở lại ĐÚNG nét đang dở, không bắt tô lại từ đầu', () => {
        const mode = stub();
        mode.showDemo();
        expect(mode.quizCalls[0].quizStartStrokeNum).toBe(4);
    });

    test('bấm dồn khi đang diễn không xếp chồng quiz', () => {
        // animateCharacter chưa gọi onComplete → vẫn đang diễn.
        const mode = stub({ autoComplete: false });
        mode.showDemo();
        mode.showDemo();
        mode.showDemo();
        expect(mode.quizCalls).toHaveLength(0);   // chưa diễn xong thì chưa mở lại
        expect(mode._demoing).toBe(true);
    });

    test('chưa có writer thì bỏ qua, không ném lỗi', () => {
        const mode = stub();
        mode.writer = null;
        expect(() => mode.showDemo()).not.toThrow();
    });
});
