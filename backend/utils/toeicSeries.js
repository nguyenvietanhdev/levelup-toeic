/**
 * Khớp đề thi vào BỘ ĐỀ (ToeicSeries) theo TIỀN TỐ source key.
 *
 * Vì sao tiền tố chứ không liệt kê đủ: một bộ có hàng chục đề (`ets26t1` …
 * `ets26t10`). Khai đúng một tiền tố `ets26` thì thêm đề mới là tự vào bộ,
 * không ai phải nhớ mở lại danh mục — đó mới là "chủ động về dữ liệu".
 *
 * Đánh đổi: tiền tố quá ngắn thì vơ nhầm (`ets2` nuốt cả ets25 lẫn ets26).
 * Đây là chuyện admin đặt từ khoá, không phải lỗi khớp — nên hàm không tự đoán,
 * chỉ khớp đúng như khai.
 */
const { normalizeSources } = require('./toeicSource');

/**
 * Chuẩn hoá danh sách từ khoá: nhận mảng hoặc chuỗi "a, b"; trim + lowercase,
 * bỏ rỗng và bỏ trùng.
 * @returns {string[]}
 */
function normalizeKeys(raw) {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : String(raw).split(',');
    return [...new Set(
        arr.map((s) => String(s ?? '').trim().toLowerCase()).filter(Boolean),
    )];
}

/**
 * Đề có nguồn nào bắt đầu bằng một trong `keys` không.
 * Xét CẢ `sources[]` lẫn `source` (đề trộn nhiều nguồn) — chỉ so `source` sẽ
 * bỏ sót đề trộn.
 */
function testMatchesKeys(test, keys) {
    const list = normalizeKeys(keys);
    if (!list.length) return false;
    const sources = normalizeSources(test || {}).map((s) => s.toLowerCase());
    return sources.some((src) => list.some((k) => src.startsWith(k)));
}

/**
 * Bộ đầu tiên (theo thứ tự mảng truyền vào) mà `test` thuộc về.
 * Không khớp bộ nào → null; phía hiển thị tự gom vào nhóm "Khác" để đề không
 * bao giờ biến mất khỏi danh sách chỉ vì admin chưa khai bộ.
 */
function seriesOfTest(test, seriesList = []) {
    return seriesList.find((s) => testMatchesKeys(test, s?.keys)) || null;
}

/** Lọc danh sách đề theo một bộ. `series` rỗng/null = không lọc. */
function filterTestsBySeries(tests = [], series = null) {
    if (!series) return [...tests];
    return tests.filter((t) => testMatchesKeys(t, series.keys));
}

module.exports = { normalizeKeys, testMatchesKeys, seriesOfTest, filterTestsBySeries };
