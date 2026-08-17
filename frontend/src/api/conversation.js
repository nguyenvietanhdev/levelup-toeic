import { Http } from './http.js';

/**
 * API chế độ Hội thoại luyện từ vựng.
 *
 * Ba lượt gọi: mở phiên · đáp một lượt · chốt thưởng.
 *
 * KHÔNG gửi điểm hay thưởng lên server — server tự tính lại từ các lượt đã lưu.
 * Client có chấm để tô sáng ngay cho mượt, nhưng con số ăn XP/xu là việc của
 * server (cùng nguyên tắc với năng lượng).
 */
/**
 * Gỡ lớp bọc của `Http`, và NÉM LỖI khi request thất bại.
 *
 * `Http.request` KHÔNG luôn ném: gặp 401/423 nó `return { success: false, error }`.
 * Viết `res?.data ?? res` thì object lỗi đó lọt qua như dữ liệu thật — màn hội
 * thoại nhận nó, `targetWords` là undefined, và người dùng thấy một phiên rỗng
 * "Từ cần dùng · 0/0" thay vì lời báo lỗi. Đúng lỗi đã gặp khi hết năng lượng:
 * server trả 400 "Không đủ năng lượng" mà giao diện vẫn mở phiên trống.
 */
function unwrap(res) {
    if (res && res.success === false) {
        throw new Error(res.error || res.message || 'Yêu cầu thất bại');
    }
    return res?.data ?? res;
}

export const ConversationAPI = {
    /**
     * Mở phiên mới.
     * @param {{source:string, part?:string, lang?:string, topic?:string}} o
     */
    async start({ source, part = '', lang = 'en', topic = '' }) {
        const res = await Http.post('/conversation/start', { source, part, lang, topic });
        return unwrap(res);
    },

    /** Gửi câu người học, nhận câu đáp của NPC. */
    async reply(id, message) {
        const res = await Http.post(`/conversation/${id}/reply`, { message });
        return unwrap(res);
    },

    /** Chốt phiên và nhận thưởng. Gọi lại nhiều lần an toàn (server chặn). */
    async finish(id) {
        const res = await Http.post(`/conversation/${id}/finish`, {});
        return unwrap(res);
    },
};
