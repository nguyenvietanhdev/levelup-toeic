/**
 * Khớp đề vào BỘ ĐỀ theo tiền tố source key.
 *
 * Đây là luật dựng thanh lọc bên Full Test. Sai là bấm một bộ ra danh sách
 * trắng, hoặc đề của bộ này lọt sang bộ kia. Toàn hàm thuần, không DB.
 */
const {
    normalizeKeys,
    testMatchesKeys,
    seriesOfTest,
    filterTestsBySeries,
} = require('../utils/toeicSeries');

const t = (source) => ({ source });
const series = (displayName, keys) => ({ displayName, keys });

describe('normalizeKeys', () => {
    test('nhận mảng, trim + lowercase', () => {
        expect(normalizeKeys([' ETS26 ', 'Ets25'])).toEqual(['ets26', 'ets25']);
    });

    test('nhận chuỗi ngăn bởi dấu phẩy (ô nhập của admin)', () => {
        expect(normalizeKeys('ets26, ets2026')).toEqual(['ets26', 'ets2026']);
    });

    test('bỏ rỗng và bỏ trùng', () => {
        expect(normalizeKeys(['ets26', '', 'ETS26', null, '  '])).toEqual(['ets26']);
    });

    test('thiếu tham số → mảng rỗng, không phải lỗi', () => {
        expect(normalizeKeys()).toEqual([]);
        expect(normalizeKeys('')).toEqual([]);
    });
});

describe('testMatchesKeys', () => {
    test('khớp theo TIỀN TỐ — một từ khoá gom cả bộ', () => {
        expect(testMatchesKeys(t('ets26t1'), ['ets26'])).toBe(true);
        expect(testMatchesKeys(t('ets26t10'), ['ets26'])).toBe(true);
    });

    test('không khớp bộ khác', () => {
        expect(testMatchesKeys(t('ets25t1'), ['ets26'])).toBe(false);
    });

    test('không phân biệt hoa thường ở cả hai phía', () => {
        expect(testMatchesKeys(t('ETS26T1'), ['ets26'])).toBe(true);
        expect(testMatchesKeys(t('ets26t1'), ['ETS26'])).toBe(true);
    });

    test('xét cả đề TRỘN nhiều nguồn, không chỉ source đầu', () => {
        expect(testMatchesKeys({ sources: ['ets25t1', 'ets26t3'] }, ['ets26'])).toBe(true);
    });

    test('không có từ khoá → không khớp (tránh bộ rỗng vơ hết đề)', () => {
        expect(testMatchesKeys(t('ets26t1'), [])).toBe(false);
        expect(testMatchesKeys(t('ets26t1'), undefined)).toBe(false);
    });

    test('đề chưa gắn nguồn → không khớp, không nổ', () => {
        expect(testMatchesKeys({}, ['ets26'])).toBe(false);
        expect(testMatchesKeys(null, ['ets26'])).toBe(false);
    });

    test('tiền tố quá ngắn thì vơ nhầm — đúng như khai, không tự đoán', () => {
        expect(testMatchesKeys(t('ets25t1'), ['ets2'])).toBe(true);
        expect(testMatchesKeys(t('ets26t1'), ['ets2'])).toBe(true);
    });
});

describe('seriesOfTest', () => {
    const list = [series('ETS 2026', ['ets26']), series('ETS 2025', ['ets25'])];

    test('trả về đúng bộ chứa đề', () => {
        expect(seriesOfTest(t('ets25t4'), list).displayName).toBe('ETS 2025');
    });

    test('không thuộc bộ nào → null (phía hiển thị gom vào "Khác")', () => {
        expect(seriesOfTest(t('toeic-co-ban-1'), list)).toBeNull();
    });

    test('danh sách bộ rỗng → null', () => {
        expect(seriesOfTest(t('ets26t1'), [])).toBeNull();
        expect(seriesOfTest(t('ets26t1'))).toBeNull();
    });
});

describe('filterTestsBySeries', () => {
    const tests = [t('ets26t1'), t('ets25t1'), t('ets26t10'), t('khac01')];

    test('chọn một bộ → ra MỌI đề của bộ đó', () => {
        expect(filterTestsBySeries(tests, series('ETS 2026', ['ets26'])).map((x) => x.source))
            .toEqual(['ets26t1', 'ets26t10']);
    });

    test('không truyền bộ = xem hết, và trả mảng mới (không sửa mảng gốc)', () => {
        const all = filterTestsBySeries(tests, null);
        expect(all).toEqual(tests);
        expect(all).not.toBe(tests);
    });

    test('bộ nhiều tiền tố gom được đề đặt tên nguồn lệch chuẩn', () => {
        const mixed = [t('ets26t1'), t('ets2026t2'), t('ets25t1')];
        expect(filterTestsBySeries(mixed, series('ETS 2026', ['ets26', 'ets2026'])))
            .toHaveLength(2);
    });
});
