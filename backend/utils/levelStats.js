/**
 * Gom phân bố ĐỘ KHÓ (A/B/C) của từ vựng theo từng nguồn.
 *
 * Tách khỏi controller để test được mà không cần MongoDB: phần dễ sai ở đây là
 * việc GOM, không phải câu truy vấn.
 */

/** Ba nhóm rỗng — dùng làm mốc khi một nguồn chưa có từ nào. */
const emptyStats = () => ({ a: 0, b: 0, c: 0 });

/**
 * Quy một giá trị `level` bất kỳ về MỘT nhóm A / B / C.
 *
 * Hệ thống dùng SONG SONG hai khung:
 *   - Tiếng Anh: CEFR   A1 A2 · B1 B2 · C1 C2
 *   - Tiếng Trung: HSK  HSK1 HSK2 · HSK3 HSK4 · HSK5 HSK6 HSK7-9
 *
 * Lấy chữ cái đầu là ĐỦ cho CEFR nhưng SAI cho HSK: "HSK1" ra chữ "H", không
 * rơi vào nhóm nào, nên cả bộ từ mất dải phân bố độ khó mà không lỗi nào báo.
 * Đây đúng là lỗi đã gặp.
 *
 * @returns {'A'|'B'|'C'|null}
 */
function toBand(level) {
    const s = String(level == null ? '' : level).trim().toUpperCase();
    if (!s) return null;

    // HSK phải xét TRƯỚC: nếu không, "HSK1" lọt xuống nhánh chữ cái đầu.
    // `HSK7-9` khớp chữ số đầu tiên là 7 → nhóm C, đúng như mong muốn.
    const hsk = s.match(/^HSK\s*-?\s*(\d)/);
    if (hsk) {
        const n = Number(hsk[1]);
        if (n <= 2) return 'A';
        if (n <= 4) return 'B';
        return 'C';          // HSK5, HSK6, HSK7-9
    }

    const first = s[0];
    return first === 'A' || first === 'B' || first === 'C' ? first : null;
}

/**
 * Biến kết quả `$group` thành Map: source -> { a, b, c }.
 *
 * @param {Array<{_id: {source: string, level: string}, count: number}>} rows
 * @returns {Map<string, {a: number, b: number, c: number}>}
 */
function groupLevelRows(rows = []) {
    const bySource = new Map();
    for (const r of rows) {
        const source = r?._id?.source;
        if (!source) continue;                       // dòng hỏng → bỏ, không ném
        if (!bySource.has(source)) bySource.set(source, emptyStats());
        const s = bySource.get(source);
        // `toBand` hiểu CẢ hai khung: CEFR (A1/B2…) và HSK (HSK1…HSK7-9).
        const lv = toBand(r?._id?.level);
        const n = Number(r?.count) || 0;
        if (lv === 'A') s.a += n;
        else if (lv === 'B') s.b += n;
        else if (lv === 'C') s.c += n;
        // Level rỗng/lạ ("D", "") → không vào nhóm nào. Dải màu vẽ theo tổng
        // a+b+c nên từ chưa gắn level không làm lệch tỉ lệ.
    }
    return bySource;
}

/**
 * Cộng dồn thống kê của NHIỀU nguồn về một cụm (một topic có thể gộp nhiều
 * sourceKeys).
 *
 * @param {string[]} sourceKeys
 * @param {Map<string, {a,b,c}>} bySource
 */
function sumStatsFor(sourceKeys = [], bySource = new Map()) {
    const sum = emptyStats();
    for (const k of sourceKeys) {
        const s = bySource.get(k);
        if (!s) continue;
        sum.a += s.a;
        sum.b += s.b;
        sum.c += s.c;
    }
    return sum;
}

/**
 * `level` đã viết hoa và bỏ khoảng trắng — dạng biểu thức aggregation.
 *
 * Dữ liệu thật có cả "A1", "a2", "HSK1", "hsk7-9", "", null.
 */
const LEVEL_UPPER = { $toUpper: { $trim: { input: { $ifNull: ['$level', ''] } } } };

/** Chữ cái đầu — đủ cho CEFR, KHÔNG đủ cho HSK (xem `LEVEL_BAND`). */
const LEVEL_INITIAL = { $substrBytes: [LEVEL_UPPER, 0, 1] };

/**
 * Quy `level` về một nhóm 'A' / 'B' / 'C' — bản aggregation của `toBand()`.
 *
 * PHẢI xử lý HSK riêng: "HSK1" lấy chữ cái đầu ra "H", không rơi vào nhóm nào,
 * nên cả bộ từ tiếng Trung mất dải phân bố độ khó mà không có lỗi nào báo.
 * (Kho zh đã chuyển hẳn sang HSK; kho en vẫn dùng CEFR — hàm này phục vụ cả hai.)
 *
 * Chữ số sau "HSK": 1-2 → A, 3-4 → B, 5 trở lên → C. "HSK7-9" lấy chữ số đầu
 * là 7 → nhóm C, đúng như mong muốn.
 */
const LEVEL_BAND = {
    $let: {
        vars: {
            up: LEVEL_UPPER,
        },
        in: {
            $cond: [
                // Bắt đầu bằng "HSK" → đọc chữ số ngay sau đó.
                { $eq: [{ $substrBytes: ['$$up', 0, 3] }, 'HSK'] },
                {
                    $let: {
                        // `$toInt` NÉM LỖI nếu ký tự không phải số ("HSK", "HSKA")
                        // → sập cả endpoint. `onError/onNull` biến nó thành 0 và
                        // rơi vào nhánh '' (không tính vào nhóm nào).
                        vars: {
                            d: {
                                $convert: {
                                    input: { $substrBytes: ['$$up', 3, 1] },
                                    to: 'int', onError: 0, onNull: 0,
                                },
                            },
                        },
                        in: {
                            $switch: {
                                branches: [
                                    { case: { $lte: ['$$d', 0] }, then: '' },   // "HSK" trống số
                                    { case: { $lte: ['$$d', 2] }, then: 'A' },
                                    { case: { $lte: ['$$d', 4] }, then: 'B' },
                                ],
                                default: 'C',
                            },
                        },
                    },
                },
                // Còn lại: CEFR — chữ cái đầu đã là nhóm.
                { $substrBytes: ['$$up', 0, 1] },
            ],
        },
    },
};

/**
 * Ba accumulator đếm A/B/C, nhét thẳng vào một `$group` đã có sẵn.
 *
 * Dùng khi controller ĐANG group theo source rồi — đếm kèm ở đó thì không tốn
 * thêm vòng khứ hồi nào tới DB.
 */
function levelSumStage() {
    const count = (letter) => ({
        $sum: { $cond: [{ $eq: [LEVEL_BAND, letter] }, 1, 0] },
    });
    return { _lvA: count('A'), _lvB: count('B'), _lvC: count('C') };
}

/** Gói ba biến đếm trên thành `levelStats` ở tầng `$project`. */
const LEVEL_STATS_PROJECT = { a: '$_lvA', b: '$_lvB', c: '$_lvC' };

module.exports = {
    toBand,
    groupLevelRows,
    sumStatsFor,
    emptyStats,
    levelSumStage,
    LEVEL_STATS_PROJECT,
    LEVEL_INITIAL,
    LEVEL_BAND,
};
