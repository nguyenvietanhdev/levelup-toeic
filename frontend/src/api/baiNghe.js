import { Http } from './http.js';

/** Bài nghe có script chạy theo (VOA Learning English). */
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

export const BaiNgheAPI = {
    /** Thư viện: `[{ id, tieuDe, lang, capDo, nguon, thoiLuong, soCau }]`, không kèm script. */
    async danhSach(lang = 'en') {
        return unwrap(await Http.get(`/bai-nghe?lang=${encodeURIComponent(lang)}`));
    },

    /** Một bài: thêm `audioUrl`, `nguonUrl`, `cau: [{ batDau, ketThuc, text }]` (giây). */
    async lay(id) {
        return unwrap(await Http.get(`/bai-nghe/${encodeURIComponent(id)}`));
    },
};
