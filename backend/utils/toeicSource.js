/**
 * Nguồn (source) của đề thi — nay cho TRỘN nhiều nguồn.
 *
 * Trước đây một đề chỉ gắn đúng một `source`, nên muốn ra đề lấy câu từ ets26t1
 * + ets26t3 + ets26t9 là không có đường. Nay đề giữ danh sách nguồn; loại đề
 * (full / mini part N) quyết định LẤY GÌ, còn danh sách nguồn quyết định LẤY TỪ ĐÂU.
 *
 * `source` (chuỗi) vẫn còn để tương thích dữ liệu cũ và để hiển thị — nó luôn
 * bằng nguồn đầu tiên trong danh sách.
 */

/** Số nguồn tối đa trộn được trong một đề. Khớp với số ô chọn ở form admin. */
const MAX_SOURCES = 3;

/**
 * Gộp `sources` (mảng) và `source` (chuỗi, kiểu cũ) thành một mảng sạch:
 * bỏ rỗng, bỏ trùng, cắt còn MAX_SOURCES.
 * @returns {string[]} mảng rỗng = không lọc nguồn (lấy tất cả kho)
 */
function normalizeSources(input = {}) {
    const raw = [];
    if (Array.isArray(input.sources)) raw.push(...input.sources);
    else if (typeof input.sources === 'string') raw.push(input.sources);
    if (input.source) raw.push(input.source);

    const seen = new Set();
    const out = [];
    for (const s of raw) {
        const v = String(s ?? '').trim();
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
        if (out.length >= MAX_SOURCES) break;
    }
    return out;
}

/**
 * Mảnh filter Mongo để lọc kho câu hỏi theo nguồn.
 * Rỗng → {} (lấy tất). Một nguồn → khớp thẳng (giữ index cũ). Nhiều → $in.
 */
function sourceMatch(sources) {
    const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
    if (!list.length) return {};
    return list.length === 1 ? { source: list[0] } : { source: { $in: list } };
}

/** Nhãn gọn để ghi log / hiện lên giao diện. */
function sourceLabel(sources) {
    const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
    return list.length ? list.join(' + ') : 'tất cả nguồn';
}

module.exports = { normalizeSources, sourceMatch, sourceLabel, MAX_SOURCES };
