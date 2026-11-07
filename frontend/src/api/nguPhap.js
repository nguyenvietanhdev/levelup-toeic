import { Http } from './http.js';

/** Công thức ngữ pháp: kho lõi, AI nhận diện chủ điểm đã có và soạn nháp mục mới. */
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

    /** `{ ketQua: 'da-co' | 'ban-nhap' | 'khong-phai', muc?, nhap?, tuCache?, conLuot }`. */
    async hoi(q) {
        return unwrap(await Http.post('/ngu-phap/hoi', { q }));
    },

    /** Đưa nháp vào thư viện chung: `{ muc, daCo, conLuot }`. */
    async themVaoThuVien(nhapId) {
        return unwrap(await Http.post(`/ngu-phap/nhap/${encodeURIComponent(nhapId)}/them`, {}));
    },

    /** Mở một lượt luyện công thức: `{ id, cau: [...], conLuot }`, không kèm đáp án. */
    async moLuyen(id) {
        return unwrap(await Http.post(`/ngu-phap/${encodeURIComponent(id)}/luyen`, {}));
    },

    /** `{ dung, khongChac, dapAn, giaiThich, ghiChu, tongKet? }`. `traLoi` rỗng = chưa biết. */
    async traLoiLuyen(buoiId, i, traLoi) {
        return unwrap(await Http.post(`/ngu-phap/buoi/${encodeURIComponent(buoiId)}/cau/${i}`, { traLoi }));
    },

    /** `{ viDuThem, daDu?, conLuot }`. */
    async themViDu(id) {
        return unwrap(await Http.post(`/ngu-phap/${encodeURIComponent(id)}/vi-du`, {}));
    },
};
