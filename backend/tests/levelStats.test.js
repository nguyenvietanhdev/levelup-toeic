/**
 * Gom phân bố độ khó A/B/C cho dải màu ở popup Chọn đề / Chọn Part.
 *
 * Chỗ dễ sai IM LẶNG: dữ liệu thật không sạch. Trường `level` có cả "A", "A1",
 * "a2", chuỗi rỗng, và cả mức lạ ("D"). Gom thẳng bằng `=== 'A'` thì "A1" rơi
 * ra ngoài — dải màu vẫn vẽ được, chỉ là tỉ lệ SAI, mà không có lỗi nào báo.
 *
 * Toàn hàm thuần, không cần MongoDB.
 */
const {
    groupLevelRows, sumStatsFor, emptyStats,
    levelSumStage, LEVEL_STATS_PROJECT, LEVEL_INITIAL,
} = require('../utils/levelStats');

/** Dựng một dòng kết quả `$group` cho gọn. */
const row = (source, level, count) => ({ _id: { source, level }, count });

describe('groupLevelRows', () => {
    test('gom ba mức về đúng nhóm', () => {
        const m = groupLevelRows([
            row('hsk1', 'A', 10),
            row('hsk1', 'B', 5),
            row('hsk1', 'C', 2),
        ]);
        expect(m.get('hsk1')).toEqual({ a: 10, b: 5, c: 2 });
    });

    test('lấy CHỮ CÁI ĐẦU — "A1"/"a2" vẫn là nhóm A', () => {
        // Đây là cái bẫy chính: so sánh nguyên chuỗi thì mất sạch các mức có số.
        const m = groupLevelRows([
            row('hsk1', 'A1', 3),
            row('hsk1', 'a2', 4),
            row('hsk1', 'A', 1),
        ]);
        expect(m.get('hsk1').a).toBe(8);
    });

    test('level rỗng/null/lạ không vào nhóm nào', () => {
        // Từ chưa gắn level không được làm lệch tỉ lệ của ba nhóm.
        const m = groupLevelRows([
            row('hsk1', 'A', 6),
            row('hsk1', '', 100),
            row('hsk1', null, 50),
            row('hsk1', 'D', 7),
        ]);
        expect(m.get('hsk1')).toEqual({ a: 6, b: 0, c: 0 });
    });

    test('tách đúng theo từng source', () => {
        const m = groupLevelRows([
            row('hsk1', 'A', 2),
            row('hsk2', 'A', 9),
            row('hsk2', 'C', 1),
        ]);
        expect(m.get('hsk1')).toEqual({ a: 2, b: 0, c: 0 });
        expect(m.get('hsk2')).toEqual({ a: 9, b: 0, c: 1 });
    });

    test('dòng hỏng (thiếu source) bị bỏ qua, không ném lỗi', () => {
        // Một dòng lạ không được làm sập cả màn chọn đề.
        expect(() => groupLevelRows([{ count: 5 }, { _id: {}, count: 3 }])).not.toThrow();
        expect(groupLevelRows([{ count: 5 }]).size).toBe(0);
    });

    test('không có dòng nào → Map rỗng', () => {
        expect(groupLevelRows([]).size).toBe(0);
        expect(groupLevelRows().size).toBe(0);
    });

    test('count không hợp lệ tính là 0, không ra NaN', () => {
        // NaN lọt xuống frontend thì `flex: NaN` làm cả dải biến mất.
        const m = groupLevelRows([row('hsk1', 'A', undefined), row('hsk1', 'B', 'x')]);
        expect(m.get('hsk1')).toEqual({ a: 0, b: 0, c: 0 });
    });
});

describe('levelSumStage — đếm A/B/C ngay trong $group sẵn có', () => {
    const stage = levelSumStage();

    test('sinh đúng ba biến đếm', () => {
        expect(Object.keys(stage)).toEqual(['_lvA', '_lvB', '_lvC']);
    });

    test('mỗi biến là một $sum có điều kiện', () => {
        for (const k of ['_lvA', '_lvB', '_lvC']) {
            expect(stage[k]).toHaveProperty('$sum.$cond');
        }
    });

    test('so khớp theo CHỮ CÁI ĐẦU, không phải nguyên chuỗi', () => {
        // `$eq: ['$level', 'A']` thì "A1" không được đếm — tỉ lệ sai trong im
        // lặng. Phải cắt ký tự đầu và viết hoa trước khi so.
        const cond = stage._lvA.$sum.$cond;
        expect(cond[0]).toEqual({ $eq: [LEVEL_INITIAL, 'A'] });
        expect(JSON.stringify(LEVEL_INITIAL)).toContain('$substrBytes');
        expect(JSON.stringify(LEVEL_INITIAL)).toContain('$toUpper');
    });

    test('level null không làm hỏng $substrBytes', () => {
        // `$substrBytes` ném lỗi nếu nhận null — phải có `$ifNull` bọc ngoài.
        expect(JSON.stringify(LEVEL_INITIAL)).toContain('$ifNull');
    });

    test('$project gói ba biến thành levelStats', () => {
        expect(LEVEL_STATS_PROJECT).toEqual({ a: '$_lvA', b: '$_lvB', c: '$_lvC' });
    });
});

describe('sumStatsFor', () => {
    const bySource = groupLevelRows([
        row('p1', 'A', 10), row('p1', 'B', 2),
        row('p2', 'A', 5), row('p2', 'C', 3),
    ]);

    test('cộng dồn nhiều nguồn của cùng một topic', () => {
        expect(sumStatsFor(['p1', 'p2'], bySource)).toEqual({ a: 15, b: 2, c: 3 });
    });

    test('nguồn không có dữ liệu bị bỏ qua, không ném lỗi', () => {
        expect(sumStatsFor(['p1', 'khong-ton-tai'], bySource)).toEqual({ a: 10, b: 2, c: 0 });
    });

    test('không nguồn nào → ba số 0 (frontend sẽ không vẽ dải)', () => {
        expect(sumStatsFor([], bySource)).toEqual(emptyStats());
        expect(sumStatsFor(undefined, undefined)).toEqual(emptyStats());
    });
});
