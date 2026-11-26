import { Http } from './http.js';

/** Tra cứu phát âm: phiên âm chuẩn, cách đọc kiểu tiếng Việt, nối âm. */
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

export const PhatAmAPI = {
    /** `{ lang, tenNgonNgu, text, ketQua: { chuan, docViet, docLienMach, tu, noiAm, meo }, tuCache, conLuot }`. */
    async tra(text, lang) {
        return unwrap(await Http.post('/phat-am/tra', { text, lang }));
    },
    /** `{ conLuot }` — không gọi AI. */
    async luot() {
        return unwrap(await Http.get('/phat-am/luot'));
    },
};
