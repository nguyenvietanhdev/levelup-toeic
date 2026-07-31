/**
 * Chuẩn hoá & lọc theo NGUỒN đề thi (trộn tối đa 3 nguồn).
 *
 * Đây là chỗ quyết định câu hỏi được bốc từ đâu — sai là ra đề lẫn câu của bộ
 * khác, hoặc lọc rỗng thành đề trắng. Toàn hàm thuần, không DB.
 */
const { normalizeSources, sourceMatch, sourceLabel, MAX_SOURCES } = require('../utils/toeicSource');

describe('normalizeSources', () => {
    test('nhận mảng sources', () => {
        expect(normalizeSources({ sources: ['ets26t1', 'ets26t3', 'ets26t9'] }))
            .toEqual(['ets26t1', 'ets26t3', 'ets26t9']);
    });

    test('vẫn nhận `source` chuỗi kiểu cũ (dữ liệu/đề cũ)', () => {
        expect(normalizeSources({ source: 'ets26t1' })).toEqual(['ets26t1']);
    });

    test('bỏ trùng, bỏ rỗng, cắt khoảng trắng', () => {
        expect(normalizeSources({ sources: [' ets26t1 ', '', 'ets26t1', null, 'ets26t3'] }))
            .toEqual(['ets26t1', 'ets26t3']);
    });

    test(`cắt còn tối đa ${MAX_SOURCES} nguồn`, () => {
        expect(normalizeSources({ sources: ['a', 'b', 'c', 'd', 'e'] })).toHaveLength(MAX_SOURCES);
    });

    test('gộp cả sources lẫn source, không nhân đôi', () => {
        expect(normalizeSources({ sources: ['ets26t1'], source: 'ets26t1' })).toEqual(['ets26t1']);
        expect(normalizeSources({ sources: ['ets26t1'], source: 'ets26t3' }))
            .toEqual(['ets26t1', 'ets26t3']);
    });

    test('không có gì → mảng rỗng (nghĩa là lấy cả kho)', () => {
        expect(normalizeSources({})).toEqual([]);
        expect(normalizeSources({ sources: [] })).toEqual([]);
        expect(normalizeSources()).toEqual([]);
    });
});

describe('sourceMatch', () => {
    test('rỗng → không lọc gì (lấy cả kho)', () => {
        expect(sourceMatch([])).toEqual({});
        expect(sourceMatch(undefined)).toEqual({});
    });

    test('một nguồn → khớp thẳng, giữ được index cũ', () => {
        expect(sourceMatch(['ets26t1'])).toEqual({ source: 'ets26t1' });
    });

    test('nhiều nguồn → $in để trộn', () => {
        expect(sourceMatch(['ets26t1', 'ets26t3', 'ets26t9']))
            .toEqual({ source: { $in: ['ets26t1', 'ets26t3', 'ets26t9'] } });
    });
});

describe('sourceLabel', () => {
    test('nói rõ đang lấy từ đâu', () => {
        expect(sourceLabel([])).toBe('tất cả nguồn');
        expect(sourceLabel(['ets26t1', 'ets26t3'])).toBe('ets26t1 + ets26t3');
    });
});
