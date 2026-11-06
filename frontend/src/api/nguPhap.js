import { Http } from './http.js';

/** Công thức ngữ pháp: kho lõi, AI mở rộng khi cần. */
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

export const NguPhapAPI = {
    /** `{ nhom, muc: [...], conLuot }`. Không gọi AI. */
    async tim(q = '') {
        return unwrap(await Http.get(`/ngu-phap?q=${encodeURIComponent(q)}`));
    },

    /** `{ muc, tuCache, conLuot }` hoặc `{ khongPhaiNguPhap: true, conLuot }`. */
    async hoi(q) {
        return unwrap(await Http.post('/ngu-phap/hoi', { q }));
    },

    /** `{ viDuThem, daDu?, conLuot }`. */
    async themViDu(id) {
        return unwrap(await Http.post(`/ngu-phap/${encodeURIComponent(id)}/vi-du`, {}));
    },
};
