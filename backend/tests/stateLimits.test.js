/**
 * Trần cho mảng client ghi được qua `saveState` (SEC-be.userstate-003).
 *
 * Vì sao đây không phải finding vặt: `wordsLearned` là ĐẦU VÀO của điều kiện
 * thành tích `words_learned` (utils/achievementRules.js). Sau bản vá
 * SEC-be.userstate-001 (bắt kiểm điều kiện trước khi trả thưởng), mảng này
 * quyết định có được trả thưởng hay không — mà client vẫn ghi được tuỳ ý.
 * Không chặn ở đây thì bản vá kia có một đường vòng: tự nhét 200 từ vào
 * `wordsLearned` rồi đi nhận thành tích "Học 200 từ vựng".
 *
 * Hậu quả thứ hai: document `UserStats` giới hạn 16MB. Không trần thì một tài
 * khoản tự đẩy document của mình tới ngưỡng, sau đó MỌI ghi vào tài khoản đó
 * đều lỗi — kể cả các đường tiền server-authoritative.
 */
const {
    boundWordList, boundPracticeHistory, MAX_WORDS, MAX_PRACTICE_HISTORY,
} = require('../utils/stateLimits');

describe('boundWordList', () => {
    test('mảng chuỗi bình thường đi qua nguyên vẹn', () => {
        expect(boundWordList(['delegate', 'audit'])).toEqual(['delegate', 'audit']);
    });

    test.each([
        ['object', {}],
        ['chuỗi', 'delegate'],
        ['số', 5],
        ['null', null],
        ['undefined', undefined],
    ])('%s → null để call site BỎ QUA, không ghi rác vào DB', (_label, raw) => {
        // Bản cũ chỉ kiểm truthy nên một object cũng gán được vào chỗ đáng lẽ
        // là mảng — rồi mọi thứ đọc `wordsLearned.length` sẽ ra undefined.
        expect(boundWordList(raw)).toBeNull();
    });

    test('bỏ phần tử không phải chuỗi thay vì từ chối cả mảng', () => {
        expect(boundWordList(['a', 5, null, {}, 'b'])).toEqual(['a', 'b']);
    });

    test('bỏ trùng và bỏ chuỗi rỗng', () => {
        expect(boundWordList(['a', 'a', '', '   ', 'b'])).toEqual(['a', 'b']);
    });

    test('cắt theo trần — đây là chốt chính', () => {
        const huge = Array.from({ length: MAX_WORDS + 5000 }, (_, i) => `w${i}`);
        expect(boundWordList(huge).length).toBe(MAX_WORDS);
    });

    test('trần phải rộng hơn kho từ vựng thật (~7.800 từ)', () => {
        // Chặn quá tay là người học thật bị mất tiến độ.
        expect(MAX_WORDS).toBeGreaterThan(10000);
    });

    test('mảng rỗng hợp lệ, khác với đầu vào rác', () => {
        expect(boundWordList([])).toEqual([]);
    });
});

describe('boundPracticeHistory', () => {
    test('cắt còn MAX_PRACTICE_HISTORY mục, giữ mục đầu (mới nhất trước)', () => {
        const long = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
        const out = boundPracticeHistory(long);
        expect(out.length).toBe(MAX_PRACTICE_HISTORY);
        expect(out[0]).toEqual({ id: 0 });
    });

    test('không phải mảng → null', () => {
        expect(boundPracticeHistory({ a: 1 })).toBeNull();
        expect(boundPracticeHistory(undefined)).toBeNull();
    });

    test('ngắn hơn trần thì giữ nguyên', () => {
        expect(boundPracticeHistory([{ id: 1 }])).toEqual([{ id: 1 }]);
    });
});

describe('đường vòng qua bản vá thành tích đã bị chặn', () => {
    test('client không thể nhét số từ vượt trần để đạt điều kiện', () => {
        const { checkAchievementCondition } = require('../utils/achievementRules');
        // Client thử khai 999.999 từ đã học.
        const claimed = Array.from({ length: 999999 }, (_, i) => `w${i}`);
        const stored = boundWordList(claimed);

        expect(stored.length).toBe(MAX_WORDS);
        // Trần không phải là "chặn gian lận" — nó chặn phình document. Việc chặn
        // gian lận là ở chỗ khác (bản vá 001 kiểm điều kiện thật). Ca này chốt
        // rằng hai lớp nối được với nhau chứ không lệch kiểu.
        const r = checkAchievementCondition(
            { conditionType: 'words_learned', conditionValue: 200 },
            { wordsLearned: stored },
        );
        expect(typeof r.current).toBe('number');
        expect(r.current).toBe(MAX_WORDS);
    });
});
