import { Http } from './http.js';

/**
 * API gợi ý luyện tập — "hôm nay nên luyện gì".
 *
 * `unwrap` giống các API khác: `Http` bọc phản hồi server vào `.data`, mà phản
 * hồi server cũng là `{ success, data }` — hai lớp. Gỡ một lớp là nhận object
 * không có dữ liệu thật.
 */
function unwrap(res) {
    const outer = res?.data ?? res;
    if (outer && typeof outer === 'object' && 'success' in outer) {
        if (outer.success === false) return null;
        if ('data' in outer) return outer.data;
    }
    return outer;
}

export const CoachAPI = {
    /**
     * Danh sách gợi ý, quan trọng nhất trước.
     *
     * KHÔNG ném lỗi — trả `[]`: đây là gợi ý phụ trợ trên trang chủ, hỏng thì
     * ẩn khối đi chứ không được chặn người dùng vào luyện tập.
     */
    async suggestions() {
        try {
            const d = unwrap(await Http.get('/coach/suggestions'));
            return Array.isArray(d?.items) ? d.items : [];
        } catch {
            return [];
        }
    },

    /**
     * Toàn bộ dữ liệu gợi ý, gồm cả LỘ TRÌNH — dùng cho lưới thẻ ở trang chủ.
     *
     * Tách khỏi `suggestions()` (chỉ trả mảng) để không phá nơi gọi cũ. Cùng
     * một endpoint nên không tốn thêm request.
     */
    async plan() {
        try {
            const d = unwrap(await Http.get('/coach/suggestions'));
            return {
                next: d?.next || null,
                vong: d?.vong || null,
                vongTheoMode: d?.vongTheoMode || {},
            };
        } catch {
            // Hỏng thì trả rỗng — lưới thẻ vẫn hiện bình thường, chỉ không có
            // hướng dẫn. Đây là thứ TĂNG THÊM, không được chặn việc luyện tập.
            return { next: null, vong: null, vongTheoMode: {} };
        }
    },
};
