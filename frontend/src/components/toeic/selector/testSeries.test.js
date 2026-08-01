import { describe, test, expect } from 'vitest';
import {
    testSeriesName, listTestSeries, testLevel, listTestLevels,
    testMatchesKeys, buildSeriesChips, filterByChip, matchesChip, OTHER_CHIP_ID,
} from './testSeries.js';

const t = (testName) => ({ testName });

describe('testSeriesName', () => {
    test('cắt đuôi "TEST <n>" để lấy tên bộ đề', () => {
        expect(testSeriesName(t('ETS 2026 TEST 10'))).toBe('ETS 2026');
        expect(testSeriesName(t('ETS 2025 TEST 3'))).toBe('ETS 2025');
    });

    test('cắt được cả dạng "FULL TEST <n>"', () => {
        expect(testSeriesName(t('ETS 2024 FULL TEST 1'))).toBe('ETS 2024');
    });

    test('cắt nốt đuôi "- PART <n>" (tên có thật trong DB)', () => {
        expect(testSeriesName(t('ETS 2026 TEST 4 - PART 2'))).toBe('ETS 2026');
        expect(testSeriesName(t('ETS 2026 TEST 3 - PART 2'))).toBe('ETS 2026');
        expect(testSeriesName(t('ETS 2026 TEST 4 - PART 1'))).toBe('ETS 2026');
    });

    test('tên không theo mẫu thì giữ nguyên', () => {
        expect(testSeriesName(t('Đề luyện nghe cấp tốc'))).toBe('Đề luyện nghe cấp tốc');
    });

    test('thiếu tên → chuỗi rỗng', () => {
        expect(testSeriesName(t(''))).toBe('');
        expect(testSeriesName(null)).toBe('');
    });
});

describe('listTestSeries', () => {
    test('bỏ trùng và xếp bộ mới nhất lên đầu', () => {
        const tests = [
            t('ETS 2024 TEST 1'), t('ETS 2026 TEST 9'), t('ETS 2025 TEST 2'),
            t('ETS 2026 TEST 10'), t('ETS 2024 FULL TEST 3'),
        ];
        expect(listTestSeries(tests)).toEqual(['ETS 2026', 'ETS 2025', 'ETS 2024']);
    });

    test('danh sách rỗng → mảng rỗng, không phải lỗi', () => {
        expect(listTestSeries([])).toEqual([]);
        expect(listTestSeries()).toEqual([]);
    });

    test('đề có đuôi "- PART n" không sinh thêm bộ rác', () => {
        const tests = [
            t('ETS 2026 TEST 4 - PART 2'), t('ETS 2026 TEST 9'), t('ETS 2025 TEST 1'),
        ];
        expect(listTestSeries(tests)).toEqual(['ETS 2026', 'ETS 2025']);
    });
});

describe('matchesChip', () => {
    test('không chọn nút nào → mọi đề đều qua', () => {
        expect(matchesChip(t('ETS 2026 FULL TEST 1'), null)).toBe(true);
    });
});

// ── Danh mục bộ đề do admin khai ────────────────────────────────────────────
const src = (source, testName = '') => ({ source, testName });
const cat = (_id, displayName, keys) => ({ _id, displayName, keys });

describe('testMatchesKeys', () => {
    test('khớp theo TIỀN TỐ source key', () => {
        expect(testMatchesKeys(src('ets26t1'), ['ets26'])).toBe(true);
        expect(testMatchesKeys(src('ets26t10'), ['ets26'])).toBe(true);
        expect(testMatchesKeys(src('ets25t1'), ['ets26'])).toBe(false);
    });

    test('không phân biệt hoa thường, xét cả đề trộn nhiều nguồn', () => {
        expect(testMatchesKeys({ sources: ['ETS25T1', 'ets26t3'] }, ['ets26'])).toBe(true);
    });

    test('thiếu từ khoá / thiếu nguồn → không khớp, không nổ', () => {
        expect(testMatchesKeys(src('ets26t1'), [])).toBe(false);
        expect(testMatchesKeys({}, ['ets26'])).toBe(false);
        expect(testMatchesKeys(null, ['ets26'])).toBe(false);
    });
});

describe('buildSeriesChips', () => {
    const tests = [src('ets26t1'), src('ets26t2'), src('ets25t1')];
    const catalog = [cat('a', 'ETS 2026', ['ets26']), cat('b', 'ETS 2025', ['ets25'])];

    test('mỗi bộ thành một nút, nhãn là tên bộ, giữ thứ tự danh mục', () => {
        expect(buildSeriesChips(tests, catalog).map(c => c.label))
            .toEqual(['ETS 2026', 'ETS 2025']);
    });

    test('bộ CHƯA có đề nào vẫn hiện nút — admin khai xong phải thấy bộ mình khai', () => {
        const withEmpty = [...catalog, cat('c', 'ETS 2022', ['ets22'])];
        expect(buildSeriesChips(tests, withEmpty).map(c => c.label))
            .toEqual(['ETS 2026', 'ETS 2025', 'ETS 2022']);
    });

    test('bộ rỗng lọc ra danh sách rỗng (để danh sách tự báo "chưa có đề")', () => {
        const empty = cat('c', 'ETS 2022', ['ets22']);
        expect(filterByChip(tests, { id: 'c', label: 'ETS 2022', keys: empty.keys }, catalog))
            .toEqual([]);
    });

    test('còn đề chưa thuộc bộ nào → thêm nút "Khác" để không đề nào biến mất', () => {
        const chips = buildSeriesChips([...tests, src('tuluyen01')], catalog);
        expect(chips.at(-1)).toMatchObject({ id: OTHER_CHIP_ID, label: 'Khác' });
    });

    test('chưa khai bộ nào → lui về cắt tên đề, thanh lọc không trống trơn', () => {
        const chips = buildSeriesChips(
            [src('x', 'ETS 2026 FULL TEST 1'), src('y', 'ETS 2025 FULL TEST 1')], [],
        );
        expect(chips.map(c => c.label)).toEqual(['ETS 2026', 'ETS 2025']);
    });
});

describe('filterByChip', () => {
    const tests = [src('ets26t1'), src('ets26t2'), src('ets25t1'), src('tuluyen01')];
    const catalog = [cat('a', 'ETS 2026', ['ets26']), cat('b', 'ETS 2025', ['ets25'])];

    test('chọn một bộ → ra MỌI đề của bộ đó', () => {
        const chip = buildSeriesChips(tests, catalog)[0];
        expect(filterByChip(tests, chip, catalog).map(t => t.source))
            .toEqual(['ets26t1', 'ets26t2']);
    });

    test('nút "Khác" gom đúng đề không thuộc bộ nào', () => {
        const other = { id: OTHER_CHIP_ID, label: 'Khác', keys: null };
        expect(filterByChip(tests, other, catalog).map(t => t.source)).toEqual(['tuluyen01']);
    });

    test('không chọn nút nào = xem hết, trả mảng mới', () => {
        const all = filterByChip(tests, null, catalog);
        expect(all).toEqual(tests);
        expect(all).not.toBe(tests);
    });

    test('đường lui (chưa có danh mục) vẫn lọc đúng theo tên đề', () => {
        const legacy = [src('x', 'ETS 2026 FULL TEST 1'), src('y', 'ETS 2025 FULL TEST 1')];
        const chip = buildSeriesChips(legacy, [])[0];
        expect(filterByChip(legacy, chip, []).map(t => t.testName))
            .toEqual(['ETS 2026 FULL TEST 1']);
    });
});

describe('độ khó (level)', () => {
    test('thiếu level → coi là trung bình', () => {
        expect(testLevel({})).toBe('intermediate');
        expect(testLevel({ level: 'advanced' })).toBe('advanced');
    });

    test('chỉ liệt kê mức CÓ THẬT trong danh sách', () => {
        expect(listTestLevels([{ level: 'intermediate' }, { level: 'intermediate' }]))
            .toEqual([{ key: 'intermediate', label: 'Trung bình' }]);
        expect(listTestLevels([{ level: 'advanced' }, { level: 'beginner' }]).map(l => l.key))
            .toEqual(['beginner', 'advanced']); // giữ thứ tự dễ → khó
    });
});
