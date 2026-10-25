import { Http } from './http.js';

/** Bài làm dở của Viết / Dịch (đề đã lấy + phần đã gõ) — vào lại làm tiếp. */
function unwrap(res) {
    if (res && res.success === false) {
        // `Http` đặt câu lỗi ở `error` khi server trả mã lỗi.
        throw new Error(res.error || res.message || 'Không đọc được bài làm dở');
    }
    // HAI lớp `.data` như mọi API khác: Http bọc { success, data: <phản hồi server> }.
    const inner = res?.data;
    if (inner && typeof inner === 'object' && 'success' in inner) {
        return inner.data ?? null;
    }
    return inner ?? res;
}

export const BaiNhapAPI = {
    /** `mode`: 'viet' | 'dich'. Trả `{ de, noiDung, capNhat }` hoặc null. */
    async get(mode) {
        return unwrap(await Http.get(`/bai-nhap/${mode}`));
    },

    /**
     * Tự lưu phần đã gõ. `deBai` = đề đang hiện: server chỉ lưu khi khớp đề của bài
     * nháp (tab cũ / máy khác với đề khác thì không ghi đè).
     */
    async luu(mode, noiDung, deBai) {
        return unwrap(await Http.put(`/bai-nhap/${mode}`, { noiDung, deBai }));
    },

    async xoa(mode) {
        return unwrap(await Http.delete(`/bai-nhap/${mode}`));
    },
};
