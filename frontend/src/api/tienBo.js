import { Http } from './http.js';

/** Tiến bộ của tôi: hồ sơ năng lực 8 tuần, gom từ mọi chế độ (server tính). */
function unwrap(res) {
    if (res && res.success === false) {
        // `Http` đặt câu lỗi ở `error` khi server trả mã lỗi.
        throw new Error(res.error || res.message || 'Không tải được tiến bộ');
    }
    // HAI lớp `.data` như mọi API khác: Http bọc { success, data: <phản hồi server> }.
    const inner = res?.data;
    if (inner && typeof inner === 'object' && 'success' in inner) {
        return inner.data ?? null;
    }
    return inner ?? res;
}

export const TienBoAPI = {
    async get() {
        return unwrap(await Http.get('/tien-bo'));
    },

    /** Sổ tay lỗi: mọi lỗi đã chữa trong Viết và Dịch, kèm cách sửa. */
    async soTayLoi() {
        return unwrap(await Http.get('/tien-bo/so-tay-loi'));
    },

    /** Tổng kết tuần này đã có chưa — chỉ đọc, không gọi AI. */
    async tongKet() {
        return unwrap(await Http.get('/tien-bo/tong-ket'));
    },

    /** Nhờ AI tổng kết tuần này (mỗi tuần một lần; đã có thì server trả bản cũ). */
    async taoTongKet() {
        return unwrap(await Http.post('/tien-bo/tong-ket', {}));
    },
};
