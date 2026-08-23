import { Http } from './http.js';

/**
 * API luyện ĐỌC HIỂU dạng TOEIC Part 7.
 *
 * `unwrap` giống Dịch/Viết luận VÌ MỘT LÝ DO CỤ THỂ: `Http` bọc phản hồi server
 * vào `.data`, mà bản thân phản hồi server cũng là `{ success, data }` — có HAI
 * lớp. Gỡ một lớp là màn hình nhận object không có dữ liệu thật.
 *
 * Lỗi phải mang theo DỮ LIỆU (`energyNeeded`, `expired`), không chỉ câu chữ:
 * đó là thứ để màn hình mở đúng popup, hoặc biết phải xin bài mới thay vì hiện
 * một dòng đỏ chung chung.
 */

function fail(payload = {}, fallback = 'Yêu cầu thất bại') {
    const err = new Error(payload.message || payload.error || fallback);
    Object.assign(err, payload);
    return err;
}

function unwrap(res) {
    if (res && res.success === false) throw fail(res);

    const outer = res?.data ?? res;
    if (outer && typeof outer === 'object' && 'success' in outer) {
        // Kiểm `success === false` TRƯỚC và KHÔNG đòi có `.data`: phản hồi lỗi
        // của server là `{ success: false, message }` — không có `data`.
        if (outer.success === false) throw fail(outer);
        if ('data' in outer) return outer.data;
    }
    return outer;
}

export const ReadingAPI = {
    /**
     * Xin một bài đọc kèm câu hỏi.
     *
     * Phản hồi CHỈ có đề và bốn lựa chọn — đáp án ở lại server cho tới lúc nộp.
     * `readingId` là thứ để server tìm lại đề khi chấm.
     */
    async passage({ words = [], level = 'medium', dang = '' } = {}) {
        return unwrap(await Http.post('/reading/passage', { words, level, dang }));
    },

    /** Nộp đáp án (mảng nhãn A–D theo thứ tự câu) và chấm. */
    async grade({ readingId, answers }) {
        return unwrap(await Http.post('/reading/grade', { readingId, answers }));
    },

    /** Lịch sử làm bài — để đối chiếu tiến bộ. */
    async history(limit = 20) {
        return unwrap(await Http.get(`/reading/history?limit=${limit}`));
    },
};
