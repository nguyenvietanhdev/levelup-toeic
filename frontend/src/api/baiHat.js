import { Http } from './http.js';

/** Học qua bài hát (riêng tư; chỉ tài khoản được cho phép). */
function unwrap(res) {
    if (res && res.success === false) {
        throw new Error(res.error || res.message || 'Không thực hiện được');
    }
    const inner = res?.data;
    if (inner && typeof inner === 'object' && 'success' in inner) {
        if (inner.success === false) throw new Error(inner.message || 'Không thực hiện được');
        return inner.data ?? null;
    }
    return inner ?? res;
}

let quyenCache = null;

export const BaiHatAPI = {
    /** Tài khoản này có được dùng không. Hỏi một lần mỗi phiên; lỗi thì coi như không. */
    async quyen() {
        if (!quyenCache) {
            quyenCache = Http.get('/bai-hat/quyen').then(unwrap).then((d) => !!d?.duocDung).catch(() => {
                quyenCache = null;
                return false;
            });
        }
        return quyenCache;
    },
    /** Đăng xuất / đổi tài khoản: hỏi lại. */
    quenQuyen() { quyenCache = null; },

    /** `{ ketQua: [{ id, tenBai, ngheSi, album, thoiLuong, coMoc }] }` từ kho lời LRCLIB. */
    async timLoi(tenBai, ngheSi = '') {
        const q = new URLSearchParams({ tenBai, ngheSi });
        return unwrap(await Http.get(`/bai-hat/tim-loi?${q}`));
    },
    async danhSach() {
        return unwrap(await Http.get('/bai-hat'));
    },
    /** `{ youtube, lrclibId }` hoặc `{ youtube, tieuDe, ngheSi, loiDan }` → `{ bai }`. */
    async them(body) {
        return unwrap(await Http.post('/bai-hat', body));
    },
    async lay(id) {
        return unwrap(await Http.get(`/bai-hat/${encodeURIComponent(id)}`));
    },
    /** `{ lech }` (giây) và/hoặc `{ moc: [giây mỗi dòng] }` → `{ bai }`. */
    async capNhat(id, body) {
        return unwrap(await Http.patch(`/bai-hat/${encodeURIComponent(id)}`, body));
    },
    async xoa(id) {
        return unwrap(await Http.delete(`/bai-hat/${encodeURIComponent(id)}`));
    },
};
