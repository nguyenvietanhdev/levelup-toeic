import { Http } from './http.js';

/** Lộ trình hôm nay: các bước học trong ngày và bước nào đã xong (server tính). */
function unwrap(res) {
    if (res && res.success === false) {
        // `Http` đặt câu lỗi ở `error` khi server trả mã lỗi.
        throw new Error(res.error || res.message || 'Không tải được lộ trình hôm nay');
    }
    // HAI lớp `.data` như mọi API khác: Http bọc { success, data: <phản hồi server> }.
    const inner = res?.data;
    if (inner && typeof inner === 'object' && 'success' in inner) {
        return inner.data ?? null;
    }
    return inner ?? res;
}

export const LoTrinhAPI = {
    async get() {
        return unwrap(await Http.get('/lo-trinh'));
    },
};
