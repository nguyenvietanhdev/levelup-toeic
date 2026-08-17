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
export const ConversationAPI = {
    /**
     * Mở phiên mới.
     * @param {{source:string, part?:string, lang?:string, topic?:string}} o
     */
    async start({ source, part = '', lang = 'en', topic = '' }) {
        const res = await Http.post('/conversation/start', { source, part, lang, topic });
        // `Http.post` bọc payload server vào `.data` và ném Error khi không ok.
        return res?.data ?? res;
    },

    /** Gửi câu người học, nhận câu đáp của NPC. */
    async reply(id, message) {
        const res = await Http.post(`/conversation/${id}/reply`, { message });
        return res?.data ?? res;
    },

    /** Chốt phiên và nhận thưởng. Gọi lại nhiều lần an toàn (server chặn). */
    async finish(id) {
        const res = await Http.post(`/conversation/${id}/finish`, {});
        return res?.data ?? res;
    },
};
