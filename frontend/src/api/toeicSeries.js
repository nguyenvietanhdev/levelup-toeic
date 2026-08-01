import { Http } from './http.js';

// Danh mục BỘ ĐỀ TOEIC — admin khai ở dashboard, frontend đọc để dựng thanh lọc
// bên Full Test. Chỉ cần đường đọc: mọi thao tác sửa nằm ở admin panel.
export const ToeicSeriesAPI = {
    /** @returns {Promise<Array<{_id, displayName, keys, order}>>} rỗng nếu lỗi/chưa khai bộ nào. */
    async list() {
        try {
            const res = await Http.get('/toeic-series');
            const body = res?.data || res;
            return body?.success && Array.isArray(body.data) ? body.data : [];
        } catch (err) {
            // Không chặn màn TOEIC vì thiếu danh mục — phía gọi tự rơi về cách cũ.
            console.error('Error loading TOEIC series:', err);
            return [];
        }
    },
};
