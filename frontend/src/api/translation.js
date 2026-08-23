import { Http } from './http.js';

/**
 * API luyện DỊCH Việt → Anh/Trung.
 *
 * `unwrap` giống hệt bên Viết luận và Hội thoại, VÌ MỘT LÝ DO CỤ THỂ: `Http`
 * bọc phản hồi server vào `.data`, mà bản thân phản hồi server cũng là
 * `{ success, data }` — nên có HAI lớp. Gỡ một lớp là màn hình nhận object
 * không có dữ liệu thật.
 *
 * Và lỗi phải mang theo DỮ LIỆU (`energyNeeded`, `tooShort`, `unitCount`),
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

export const TranslationAPI = {
    /**
     * Xin một đoạn văn tiếng Việt để dịch.
     *
     * `words` là những từ vừa luyện ở đề đang chọn — server KHÔNG biết được, vì
     * bộ từ nằm ở client sau khi đã lọc theo Part và cấp độ. Đây là ngoại lệ có
     * chủ ý so với `EssayAPI.prompt()` (không gửi gì): đề bài bám vào đúng vốn
     * từ vừa học thì dịch xong là ôn luôn, thay vì gặp một đoạn toàn từ lạ.
     *
     * Ngôn ngữ đích thì VẪN không gửi — server đọc từ hồ sơ.
     */
    async passage({ words = [], level = 'medium' } = {}) {
        return unwrap(await Http.post('/translation/passage', { words, level }));
    },

    /** Nộp bản dịch và chấm. */
    async grade({ passage, translation, topic = '', words = [], level = 'medium' }) {
        return unwrap(await Http.post('/translation/grade', {
            passage, translation, topic, words, level,
        }));
    },

    /** Danh sách bài đã dịch — để đối chiếu tiến bộ. */
    async history(limit = 20) {
        return unwrap(await Http.get(`/translation/history?limit=${limit}`));
    },

    /**
     * Nhật ký lỗi ngữ pháp — gom từ MỌI bài đã chấm (Dịch + Viết luận).
     *
     * Không truyền gì thì lấy 90 ngày gần nhất: lỗi từ nửa năm trước có thể đã
     * sửa được rồi, tính vào thống kê là chẩn đoán theo dữ liệu đã cũ.
     */
    async mistakes(days = 90) {
        return unwrap(await Http.get(`/translation/mistakes?days=${days}`));
    },
};
