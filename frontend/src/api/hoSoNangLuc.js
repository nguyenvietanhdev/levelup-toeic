import { Http } from './http.js';

/** Hồ sơ năng lực: một trang gộp mọi thứ hệ thống biết về người học. */
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

export const HoSoNangLucAPI = {
    /** `{ tongQuan, diemManh, canCaiThien, kyNang, kyNangCon, toeic, thanhTich, coDuLieu }` */
    async get() {
        return unwrap(await Http.get('/ho-so-nang-luc'));
    },
};
