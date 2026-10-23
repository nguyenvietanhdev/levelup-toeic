import { Http } from './http.js';

/**
 * Nghe với AI (TTS). Đoạn nghe chỉ nằm ở server: client chỉ nhận id, và nghe qua
 * `audioUrl` — không bao giờ nhận được chữ của đoạn trước khi chấm.
 */
function unwrap(res) {
    if (res && res.success === false) {
        throw new Error(res.message || 'Có lỗi khi xử lý bài nghe');
    }
    // Hai lớp `.data` (Http bọc phản hồi server): gỡ đúng hai lớp như các API khác.
    const inner = res?.data;
    if (inner && typeof inner === 'object' && 'success' in inner) {
        return inner.data ?? null;
    }
    return inner ?? res;
}

export const ListeningAPI = {
    /** Mở một lượt nghe: server chọn từ, trừ năng lượng, AI viết đoạn. */
    async start({ level = 'medium', dang = '', tuChon = '' } = {}) {
        return unwrap(await Http.post('/listening/start', { level, dang, tuChon }));
    },

    /** Nộp bài chép lại và nhận kết quả (kèm đoạn gốc đã được mở khoá). */
    async grade(id, typed) {
        return unwrap(await Http.post(`/listening/${encodeURIComponent(id)}/grade`, { typed }));
    },

    /** Các lượt nghe đã chấm, mới nhất trước (không kèm đoạn gốc). */
    async history(limit = 20) {
        return unwrap(await Http.get(`/listening/history?limit=${limit}`));
    },

    /** Xem lại một lượt đã chấm: đoạn gốc, bài đã gõ, từ thiếu / thừa. */
    async detail(id) {
        return unwrap(await Http.get(`/listening/${encodeURIComponent(id)}`));
    },

    /** Đường dẫn âm thanh của lượt nghe, với tốc độ đọc. */
    audioUrl(id, rate = 0.9) {
        return `/api/listening/${encodeURIComponent(id)}/audio?rate=${encodeURIComponent(rate)}`;
    },
};
