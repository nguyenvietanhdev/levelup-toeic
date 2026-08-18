/**
 * Viết luận — chuẩn HSK 书写 (tiếng Trung).
 *
 * Hai chuẩn chứ không phải một chuẩn dịch sang hai thứ tiếng. Chỗ dễ hỏng nhất
 * KHÔNG phải chữ nghĩa mà là ĐƠN VỊ ĐẾM: tiếng Trung không đặt khoảng trắng
 * giữa các từ, nên đếm theo khoảng trắng thì cả bài luận ra đúng 1 và người học
 * viết bao nhiêu cũng không bao giờ nộp được bài.
 */
const {
    countWords, countChars, countUnits,
    criteriaFor, limitsFor, overallBand,
    CRITERIA, CRITERIA_ZH, MIN_WORDS, MIN_CHARS_ZH, MAX_CHARS_ZH,
} = require('../services/essayGrader');

/** Một đoạn HSK thật: 38 chữ Hán, không có khoảng trắng nào. */
const ZH = '我认为学习外语很重要。因为语言是沟通的工具，可以帮助我们了解别的国家的文化。';

describe('đếm — đơn vị phải ĐÚNG với ngôn ngữ', () => {
    test('đếm theo TỪ trả về 1 cho cả bài tiếng Trung', () => {
        // Chính là lý do phải có `countChars`. Khoá lại hành vi này để thấy rõ
        // vì sao không dùng chung được.
        expect(countWords(ZH)).toBe(1);
    });

    test('đếm theo CHỮ HÁN ra đúng số chữ', () => {
        expect(countChars(ZH)).toBe(35);
    });

    test('KHÔNG đếm dấu câu — nếu không thì nhồi 。，là qua ngưỡng', () => {
        expect(countChars('。，！？、；：""')).toBe(0);
        expect(countChars('我，。！')).toBe(1);
    });

    test('không đếm chữ Latin và số lẫn trong bài', () => {
        expect(countChars('我有 3 个 apple 和书')).toBe(5); // 我 有 个 和 书
    });

    test('countUnits rẽ đúng nhánh theo lang', () => {
        expect(countUnits(ZH, 'zh')).toBe(35);
        expect(countUnits('one two three', 'en')).toBe(3);
        // Không truyền lang → mặc định tiếng Anh, giữ hành vi cũ.
        expect(countUnits('one two three')).toBe(3);
    });

    test('rỗng là 0, KHÔNG phải 1', () => {
        expect(countChars('')).toBe(0);
        expect(countChars('   ')).toBe(0);
        expect(countUnits('', 'zh')).toBe(0);
    });
});

describe('ngưỡng độ dài — HSK khác IELTS', () => {
    test('tiếng Trung dùng ngưỡng CHỮ, thấp hơn 250 từ của IELTS', () => {
        // Bắt viết 250 chữ Hán là dài gần gấp đôi bài HSK6 thi thật.
        expect(limitsFor('zh').min).toBe(MIN_CHARS_ZH);
        expect(limitsFor('zh').min).toBeLessThan(MIN_WORDS);
        expect(limitsFor('zh').max).toBe(MAX_CHARS_ZH);
    });

    test('tiếng Anh giữ nguyên 250 từ', () => {
        expect(limitsFor('en').min).toBe(MIN_WORDS);
    });

    test('lang lạ rơi về tiếng Anh, không phải undefined', () => {
        expect(limitsFor('fr').min).toBe(MIN_WORDS);
        expect(limitsFor().min).toBe(MIN_WORDS);
    });
});

describe('bộ tiêu chí', () => {
    test('HSK có `characters`, KHÔNG có `lexical`', () => {
        // Viết nhầm 的/得/地 hay dùng chữ đồng âm sai là lỗi nặng của tiếng
        // Trung, không có thứ tương đương trong tiêu chí IELTS.
        const keys = CRITERIA_ZH.map(c => c.key);
        expect(keys).toContain('characters');
        expect(keys).not.toContain('lexical');
    });

    test('IELTS có `lexical`, KHÔNG có `characters`', () => {
        const keys = CRITERIA.map(c => c.key);
        expect(keys).toContain('lexical');
        expect(keys).not.toContain('characters');
    });

    test('cả hai bộ đều đúng BỐN tiêu chí', () => {
        expect(CRITERIA).toHaveLength(4);
        expect(CRITERIA_ZH).toHaveLength(4);
    });

    test('mỗi tiêu chí HSK có nhãn tiếng Việt', () => {
        // "汉字词汇" không nói lên điều gì với người học Việt Nam.
        for (const c of CRITERIA_ZH) {
            expect(typeof c.vi).toBe('string');
            expect(c.vi.length).toBeGreaterThan(0);
        }
    });

    test('criteriaFor rẽ đúng nhánh', () => {
        expect(criteriaFor('zh')).toBe(CRITERIA_ZH);
        expect(criteriaFor('en')).toBe(CRITERIA);
        expect(criteriaFor()).toBe(CRITERIA);
    });
});

describe('band tổng — phải tính theo bộ tiêu chí ĐÚNG', () => {
    test('điểm HSK tính đủ cả bốn, kể cả `characters`', () => {
        const scores = { taskResponse: 7, coherence: 6, characters: 8, grammar: 7 };
        expect(overallBand(scores, 'zh')).toBe(7);
    });

    test('lấy nhầm bộ IELTS cho bài HSK → tụt điểm', () => {
        // Đây là lý do `overallBand` phải nhận `lang`: với bộ IELTS thì
        // `lexical` là undefined → clamp thành 0 → trung bình tụt còn 3/4.
        const scores = { taskResponse: 8, coherence: 8, characters: 8, grammar: 8 };
        expect(overallBand(scores, 'zh')).toBe(8);
        expect(overallBand(scores, 'en')).toBe(6);   // 8+8+0+8 = 24/4
    });

    test('không truyền lang → giữ hành vi cũ (IELTS)', () => {
        const scores = { taskResponse: 6, coherence: 6, lexical: 6, grammar: 6 };
        expect(overallBand(scores)).toBe(6);
    });
});
