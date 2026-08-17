/**
 * `unwrap` của ConversationAPI — HAI lớp `.data` lồng nhau.
 *
 * Đây là chỗ tôi viết sai HAI lần, nên test này gọi hàm THẬT thay vì dò mã
 * nguồn: dò chuỗi chỉ chứng minh code trông đúng, không chứng minh nó chạy đúng.
 *
 * Hình dạng dữ liệu thật:
 *
 *   Http trả   : { success: true, data: <nguyên văn phản hồi server> }
 *   Server trả : { success: true, data: { id, targetWords, … } }
 *
 * Nên `res.data` mới là `{ success, data }`, CHƯA phải `{ id, … }`.
 *
 * Hai lỗi đã mắc:
 *   1. Gỡ MỘT lớp (`res?.data ?? res`) → màn nhận object không có `id` →
 *      "Server trả về dữ liệu không hợp lệ".
 *   2. Đòi có CẢ `success` LẪN `data` mới xử lý → phản hồi LỖI của server là
 *      `{ success: false, message }` (không có `data`) nên rơi qua điều kiện và
 *      lọt xuống như dữ liệu thật.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Chặn `Http` thật để gọi được `unwrap` qua đúng đường công khai.
const post = vi.fn();
vi.mock('./http.js', () => ({ Http: { post: (...a) => post(...a) } }));

const { ConversationAPI } = await import('./conversation.js');

beforeEach(() => post.mockReset());
afterEach(() => vi.clearAllMocks());

describe('gỡ đúng hai lớp bọc', () => {
    test('Http bọc + server bọc → trả payload trong cùng', () => {
        post.mockResolvedValue({
            success: true,
            data: { success: true, data: { id: 'abc', targetWords: ['菜'] } },
        });
        return expect(ConversationAPI.start()).resolves.toEqual({
            id: 'abc', targetWords: ['菜'],
        });
    });

    test('chỉ MỘT lớp → vẫn trả đúng, không lột quá tay', () => {
        // Nếu sau này `Http` thôi bọc, gỡ cứng hai lần sẽ lột mất dữ liệu thật.
        post.mockResolvedValue({ success: true, data: { id: 'xyz' } });
        return expect(ConversationAPI.start()).resolves.toEqual({ id: 'xyz' });
    });
});

describe('lỗi phải NÉM, không được lọt qua', () => {
    test('lỗi ở lớp Http (401/423) — Http KHÔNG ném, nó return', () => {
        post.mockResolvedValue({ success: false, error: 'Token expired' });
        return expect(ConversationAPI.start()).rejects.toThrow('Token expired');
    });

    test('lỗi ở lớp SERVER — không có `.data`, dễ rơi qua điều kiện', () => {
        // Đúng lỗi thứ hai đã mắc: đòi cả `success` lẫn `data` thì nhánh này
        // trượt, và object lỗi đi tiếp như dữ liệu thật.
        post.mockResolvedValue({
            success: true,
            data: { success: false, message: 'Chưa chọn đề từ vựng' },
        });
        return expect(ConversationAPI.start()).rejects.toThrow('Chưa chọn đề từ vựng');
    });

    test('không đủ năng lượng cũng ném', () => {
        post.mockResolvedValue({
            success: true,
            data: { success: false, message: 'Không đủ năng lượng' },
        });
        return expect(ConversationAPI.start()).rejects.toThrow('Không đủ năng lượng');
    });
});

describe('cả ba lượt gọi dùng cùng một luật', () => {
    const shaped = {
        success: true,
        data: { success: true, data: { ok: 1 } },
    };

    test('reply', () => {
        post.mockResolvedValue(shaped);
        return expect(ConversationAPI.reply('id1', 'xin chào')).resolves.toEqual({ ok: 1 });
    });

    test('finish', () => {
        post.mockResolvedValue(shaped);
        return expect(ConversationAPI.finish('id1')).resolves.toEqual({ ok: 1 });
    });

    test('reply cũng ném lỗi server', () => {
        post.mockResolvedValue({
            success: true,
            data: { success: false, message: 'Hội thoại đã kết thúc' },
        });
        return expect(ConversationAPI.reply('id1', 'x')).rejects.toThrow('Hội thoại đã kết thúc');
    });
});

describe('start không gửi tham số đề/part/lang', () => {
    test('chỉ gửi `topic`', async () => {
        // Server tự đọc đề/part/ngôn ngữ từ hồ sơ — gửi thêm là mở lại đúng
        // ranh giới đã gây ra cả chuỗi lỗi trước đó.
        post.mockResolvedValue({ success: true, data: { success: true, data: { id: 'a' } } });
        await ConversationAPI.start();
        const [url, body] = post.mock.calls[0];
        expect(url).toBe('/conversation/start');
        expect(Object.keys(body)).toEqual(['topic']);
    });
});
