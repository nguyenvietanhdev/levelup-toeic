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

/**
 * Lỗi có mang theo DỮ LIỆU của server, không chỉ câu chữ.
 *
 * `throw new Error(message)` là mất sạch `energyNeeded`, `currentEnergy`,
 * `needTopic`… — mà đó mới là thứ để màn hình xử lý ĐÚNG: thiếu năng lượng thì
 * mở popup nạp, chưa chọn đề thì mở popup chọn đề. Chỉ có câu chữ thì mọi lỗi
 * đều thành một dòng đỏ giống nhau, và người dùng phải tự đoán làm gì tiếp.
 */
function fail(payload = {}, fallback = 'Yêu cầu thất bại') {
    const err = new Error(payload.message || payload.error || fallback);
    Object.assign(err, payload);
    return err;
}

function unwrap(res) {
    if (res && res.success === false) {
        throw fail(res);
    }

    // HAI lớp `.data` lồng nhau — chỗ này rất dễ nhầm:
    //
    //   Http trả   : { success: true, data: <nguyên văn phản hồi server> }
    //   Server trả : { success: true, data: { id, targetWords, … } }
    //
    // Nên `res.data` mới là `{ success, data }`, CHƯA phải `{ id, … }`. Gỡ một
    // lớp là màn hội thoại nhận object không có `id` — đúng lỗi "Server trả về
    // dữ liệu không hợp lệ".
    //
    // Gỡ theo ĐIỀU KIỆN chứ không gỡ cứng hai lần: nếu sau này `Http` thôi bọc
    // (hoặc endpoint trả thẳng payload) thì gỡ cứng lại lột mất dữ liệu thật.
    const outer = res?.data ?? res;
    if (outer && typeof outer === 'object' && 'success' in outer) {
        // Kiểm `success === false` TRƯỚC, và KHÔNG đòi có `.data`: phản hồi lỗi
        // của server là `{ success: false, message }` — không có `data`. Đòi cả
        // hai thì lỗi rơi qua điều kiện và lọt xuống như dữ liệu thật.
        if (outer.success === false) {
            throw fail(outer);
        }
        if ('data' in outer) return outer.data;
    }
    return outer;
}

export const ConversationAPI = {
    /**
     * Mở phiên mới.
     *
     * KHÔNG cần tham số: server tự đọc đề · part · ngôn ngữ từ hồ sơ người dùng.
     * Trước đây client phải gửi ba thứ đó lên, và cả ba đều từng sai kiểu hoặc
     * rỗng — bỏ hết là bỏ hết cơ hội đoán sai ở ranh giới.
     *
     * `topic` (bối cảnh hội thoại) vẫn cho truyền: nó là lựa chọn của người
     * dùng cho PHIÊN NÀY, không phải dữ liệu đã lưu ở đâu đó.
     */
    async start({ topic = '' } = {}) {
        const res = await Http.post('/conversation/start', { topic });
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
