/**
 * Gom phân bố ĐỘ KHÓ (A/B/C) của từ vựng theo từng nguồn.
 *
 * Tách khỏi controller để test được mà không cần MongoDB: phần dễ sai ở đây là
 * việc GOM, không phải câu truy vấn.
 */

/** Ba nhóm rỗng — dùng làm mốc khi một nguồn chưa có từ nào. */
const emptyStats = () => ({ a: 0, b: 0, c: 0 });

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
        // Chỉ lấy CHỮ CÁI ĐẦU: dữ liệu thật có cả "A", "A1", "a2"…
        const lv = String(r?._id?.level || '').trim().toUpperCase()[0];
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
 * Chữ cái đầu của `level`, viết hoa — dạng biểu thức aggregation.
 *
 * Dữ liệu thật có cả "A", "A1", "a2", null. So sánh nguyên chuỗi (`$eq: 'A'`)
 * thì "A1" rơi ra ngoài: dải màu vẫn vẽ, chỉ là tỉ lệ SAI mà không lỗi gì.
 */
const LEVEL_INITIAL = {
    $toUpper: { $substrBytes: [{ $ifNull: ['$level', ''] }, 0, 1] },
};

/**
 * Ba accumulator đếm A/B/C, nhét thẳng vào một `$group` đã có sẵn.
 *
 * Dùng khi controller ĐANG group theo source rồi — đếm kèm ở đó thì không tốn
 * thêm vòng khứ hồi nào tới DB.
 */
function levelSumStage() {
    const count = (letter) => ({
        $sum: { $cond: [{ $eq: [LEVEL_INITIAL, letter] }, 1, 0] },
    });
    return { _lvA: count('A'), _lvB: count('B'), _lvC: count('C') };
}

/** Gói ba biến đếm trên thành `levelStats` ở tầng `$project`. */
const LEVEL_STATS_PROJECT = { a: '$_lvA', b: '$_lvB', c: '$_lvC' };

module.exports = {
    groupLevelRows,
    sumStatsFor,
    emptyStats,
    levelSumStage,
    LEVEL_STATS_PROJECT,
    LEVEL_INITIAL,
};
