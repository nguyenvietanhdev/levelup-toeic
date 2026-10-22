import { Http } from './http.js';

/**
 * Vai của AI theo Part. Một Part = một cặp (đề, Part) + ngôn ngữ kho.
 * Mỗi vai có tiêu đề (title) và mô tả ngắn (text). Server giữ vai AI đã lưu dùng
 * chung và vai riêng của người học; client chỉ hiển thị và gửi yêu cầu.
 */
function unwrap(res) {
    if (res && res.success === false) {
        throw new Error(res.message || 'Có lỗi khi xử lý vai');
    }
    // HAI lớp `.data`: Http bọc phản hồi server thành { success, data: <phản hồi> },
    // và server trả { success, data: { title, vai, nguon } }. Gỡ một lớp là nhận
    // nhầm object có `success` và giao diện báo "Chưa có vai" dù server đã có vai.
    const inner = res?.data;
    if (inner && typeof inner === 'object' && 'success' in inner) {
        return inner.data ?? null;
    }
    return inner ?? res;
}

const qs = (o) => new URLSearchParams(o).toString();

export const RolesAPI = {
    /** Vai đang áp dụng cho Part (vai riêng nếu có, không thì vai AI đã lưu gần nhất). */
    async get({ source, part, lang }) {
        return unwrap(await Http.get(`/roles?${qs({ source, part, lang })}`));
    },

    /** Mọi vai của Part: { vai (vai riêng hoặc null), ai: [vai AI đã lưu, mới nhất trước] }. */
    async list({ source, part, lang }) {
        return unwrap(await Http.get(`/roles/list?${qs({ source, part, lang })}`));
    },

    /**
     * Nhờ AI viết một BẢN NHÁP (tiêu đề + mô tả). KHÔNG lưu: người học xem rồi mới
     * bấm "Lưu vai AI".
     */
    async suggest({ source, part, lang }) {
        return unwrap(await Http.post('/roles/suggest', { source, part, lang }));
    },

    /** Lưu một vai AI đã được người học xem. Trùng nội dung thì không lưu thêm. */
    async saveAi({ source, part, lang, title, text }) {
        return unwrap(await Http.post('/roles/save-ai', { source, part, lang, title, text }));
    },

    /** Lưu vai do người học tự viết (thay vai AI của Part với riêng người này). */
    async save({ source, part, lang, title, text }) {
        return unwrap(await Http.put('/roles/mine', { source, part, lang, title, text }));
    },

    /** Xoá vai riêng; sau đó quay về vai AI đang dùng của Part. */
    async remove({ source, part, lang }) {
        return unwrap(await Http.delete(`/roles/mine?${qs({ source, part, lang })}`));
    },
};
