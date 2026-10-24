import { Http } from './http.js';

/**
 * Dạng bài AI gợi ý HỢP với bộ từ của Part (nhóm "Hợp bộ từ này" trên màn chọn).
 * Server hỏi AI một lần cho mỗi Part rồi lưu lại; client chỉ đọc danh sách khoá.
 */
function unwrap(res) {
    if (res && res.success === false) {
        // `Http` đặt câu lỗi ở `error` (không phải `message`) khi server trả mã lỗi.
        throw new Error(res.error || res.message || 'Không lấy được gợi ý dạng bài');
    }
    // HAI lớp `.data` như mọi API khác: Http bọc { success, data: <phản hồi server> }.
    const inner = res?.data;
    if (inner && typeof inner === 'object' && 'success' in inner) {
        return inner.data ?? null;
    }
    return inner ?? res;
}

export const DangGoiYAPI = {
    /** Khoá dạng bài hợp bộ từ: mode = reading | essay | translation | listening. */
    async get({ mode, source, part, lang }) {
        const q = new URLSearchParams({ mode, source, part, lang }).toString();
        const d = unwrap(await Http.get(`/dang-goi-y?${q}`));
        return Array.isArray(d?.keys) ? d.keys : [];
    },
};
