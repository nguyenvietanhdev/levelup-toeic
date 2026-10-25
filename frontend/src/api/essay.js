import { Http } from './http.js';

/**
 * API luyện viết luận — chấm theo tiêu chí IELTS Task 2.
 *
 * `unwrap` giống hệt bên Hội thoại và VÌ MỘT LÝ DO CỤ THỂ: `Http` bọc phản hồi
 * server vào `.data`, mà bản thân phản hồi server cũng là `{ success, data }` —
 * nên có HAI lớp. Gỡ một lớp là màn hình nhận object không có dữ liệu thật.
 *
 * Và lỗi phải mang theo DỮ LIỆU (`energyNeeded`, `tooShort`, `wordCount`),
 * không chỉ câu chữ: đó là thứ để màn hình mở đúng popup thay vì hiện một dòng
 * đỏ chung chung.
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

export const EssayAPI = {
    /**
     * Xin một đề Task 2.
     *
     * KHÔNG gửi chủ đề lên — server tự đọc đề từ vựng đang chọn từ hồ sơ. Đây là
     * bài học từ Hội thoại: mỗi tham số client phải tự gom là một chỗ đoán sai
     * hình dạng dữ liệu.
     */
    async prompt({ level = 'medium', rubric, dang = '', tuChon = '', nhamYeu = true } = {}) {
        // `level` và `rubric` là lựa chọn của người dùng ngay tại màn hình, server
        // không có cách nào biết. Chủ đề và ngôn ngữ vẫn do server đọc từ hồ sơ.
        return unwrap(await Http.post('/essay/prompt', { level, rubric, dang, tuChon, nhamYeu: nhamYeu !== false }));
    },

    /** Nộp bài và chấm theo kiểu chấm của đề (server kiểm lại tính hợp lệ). */
    async grade({ prompt, essay, promptType = '', topicHint = '', rubric }) {
        return unwrap(await Http.post('/essay/grade', { prompt, essay, promptType, topicHint, rubric }));
    },

    /** Danh sách bài đã viết — để đối chiếu tiến bộ. */
    async history(limit = 20) {
        return unwrap(await Http.get(`/essay/history?limit=${limit}`));
    },

    /** Nộp lại bài đã sửa để AI xem lại (không điểm, không XP, tối đa 3 lần/bài). */
    async xemLai(id, noiDung) {
        return unwrap(await Http.post(`/essay/${encodeURIComponent(id)}/xem-lai`, { noiDung }));
    },

    /** Xem lại đầy đủ một bài viết đã chấm (kèm nhãn tiêu chí). */
    async detail(id) {
        return unwrap(await Http.get(`/essay/${encodeURIComponent(id)}`));
    },
};
