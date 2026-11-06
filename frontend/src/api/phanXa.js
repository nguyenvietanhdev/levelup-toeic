import { Http } from './http.js';

/** Phản xạ câu: nhìn câu tiếng Việt, nói/gõ câu tiếng Anh, thấy ngay câu đúng. */
function unwrap(res) {
    if (res && res.success === false) {
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

export const PhanXaAPI = {
    /** `{ hoTro, khung: [{ key, ten, icon, moTa, tong, moi, denHan, daThuoc }], denHan, moi, daThuoc, tong }` */
    async tongQuan() {
        return unwrap(await Http.get('/phan-xa/tong-quan'));
    },

    /** Mở lượt: `{ id, cau: [{ vi, khung, tenKhung }] }` hoặc null nếu không còn câu. */
    async taoBuoi({ khung = '', som = false } = {}) {
        return unwrap(await Http.post('/phan-xa/buoi', { khung, som: som === true }));
    },

    /** Trả lời câu `i` (`traLoi` rỗng = bỏ qua): `{ dung, khongChac, boQua, cauDung, ghiChu, daThuoc }`. */
    async traLoi(id, i, traLoi) {
        return unwrap(await Http.post(`/phan-xa/buoi/${encodeURIComponent(id)}/cau/${i}`, { traLoi }));
    },
};
