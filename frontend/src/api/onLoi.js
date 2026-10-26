import { Http } from './http.js';

/** Kiểm tra lại lỗi đã chữa (nhận ra → sửa → hiểu vì sao → áp dụng câu mới). */
function unwrap(res) {
    if (res && res.success === false) {
        // `Http` đặt câu lỗi ở `error` khi server trả mã lỗi.
        throw new Error(res.error || res.message || 'Không thực hiện được');
    }
    // HAI lớp `.data` như mọi API khác: Http bọc { success, data: <phản hồi server> }.
    const inner = res?.data;
    if (inner && typeof inner === 'object' && 'success' in inner) {
        if (inner.success === false) throw new Error(inner.message || 'Không thực hiện được');
        return inner.data ?? null;
    }
    return inner ?? res;
}

export const OnLoiAPI = {
    /** `{ tong, denHan, daNam, nghiHocVet, lanToi }` */
    async tongQuan() {
        return unwrap(await Http.get('/on-loi/tong-quan'));
    },

    /** Mở buổi: `{ id, cau: [{ dang, de }] }` hoặc null nếu không có lỗi nào. */
    async taoBuoi(som = false) {
        return unwrap(await Http.post('/on-loi/buoi', { som: som === true }));
    },

    /** Trả lời câu `i`: `{ dung, dapAn, trangThai }`. */
    async traLoi(id, i, body) {
        return unwrap(await Http.post(`/on-loi/buoi/${encodeURIComponent(id)}/cau/${i}`, body));
    },
};
