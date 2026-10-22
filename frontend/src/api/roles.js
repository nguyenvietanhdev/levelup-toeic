import { Http } from './http.js';

/**
 * Vai của AI theo Part. Một Part = một cặp (đề, Part) + ngôn ngữ kho.
 * Server giữ vai AI dùng chung và vai riêng của người học; client chỉ hiển thị
 * và gửi yêu cầu.
 */
function unwrap(res) {
    if (res && res.success === false) {
        throw new Error(res.message || 'Có lỗi khi xử lý vai');
    }
    return res?.data ?? res;
}

const qs = (o) => new URLSearchParams(o).toString();

export const RolesAPI = {
    /** Vai đang áp dụng cho Part (vai riêng nếu có, không thì vai AI, không thì null). */
    async get({ source, part, lang }) {
        return unwrap(await Http.get(`/roles?${qs({ source, part, lang })}`));
    },

    /** Nhờ AI đề xuất vai. Đã có vai AI cho Part thì trả lại, không gọi AI. */
    async suggest({ source, part, lang }) {
        return unwrap(await Http.post('/roles/suggest', { source, part, lang }));
    },

    /** Lưu vai do người học tự viết (thay vai AI của Part với riêng người này). */
    async save({ source, part, lang, text }) {
        return unwrap(await Http.put('/roles/mine', { source, part, lang, text }));
    },

    /** Xoá vai riêng; sau đó quay về vai AI của Part. */
    async remove({ source, part, lang }) {
        return unwrap(await Http.delete(`/roles/mine?${qs({ source, part, lang })}`));
    },
};
