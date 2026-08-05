/**
 * Enforcement: ORIGIN CỦA CHÍNH APP LUÔN ĐƯỢC PHÉP, KHÔNG CẦN CẤU HÌNH.
 *
 * Vì sao cần — đây là một lỗi đã ra tới production và nó bắt nguồn từ một câu SAI
 * trong chính báo cáo audit của bộ skill này:
 *
 *   "vá theo hướng cùng origin thì request không có header Origin, nhánh
 *    `if (!origin)` short-circuit, nên DEPLOY-002 không bao giờ chạm tới"
 *
 * Sai ở chỗ: trình duyệt CÓ gửi `Origin` cho mọi request method != GET/HEAD, kể
 * cả same-origin (chính vì thế header này dùng được để chống CSRF). Nên:
 *   - GET  /api/...  → không Origin → qua nhánh `!origin` → chạy bình thường
 *   - POST /api/auth/login → CÓ Origin → so với danh sách mặc định toàn localhost
 *     → CHẶN
 * Kết quả trên production: trang load đẹp, đăng nhập chết. Đúng kiểu lỗi trông
 * như "app đã ổn" cho tới lúc ai đó bấm nút.
 *
 * Sửa gốc thay vì đặt CORS_ORIGIN: backend giờ phục vụ luôn bản build frontend,
 * nên origin của CHÍNH NÓ phải luôn hợp lệ — bất kể đang chạy ở domain nào. Bắt
 * người deploy khai lại domain của chính mình vào env là một bước thừa mà quên là
 * hỏng, và nó hỏng im lặng.
 *
 * Test thuần: gọi trực tiếp hàm quyết định, không nạp app, không DB, không HTTP.
 */
const { corsOptionsDelegate } = require('../utils/corsPolicy');

/** Giả một request Express đủ dùng cho hàm quyết định. */
const reqFrom = ({ origin, host = 'levelup-toeic.onrender.com', protocol = 'https', method = 'POST' }) => ({
    method,
    protocol,
    headers: { origin },
    get: (h) => (h.toLowerCase() === 'host' ? host : undefined),
});

/** Chạy delegate rồi trả về `origin` trong options mà `cors` sẽ dùng. */
function decide(req, env = {}) {
    let result;
    corsOptionsDelegate(req, (err, opts) => { result = { err, opts }; }, env);
    return result;
}

describe('CORS — origin của chính app', () => {

    test('POST same-origin được phép dù KHÔNG cấu hình CORS_ORIGIN', () => {
        // Đây chính là ca đã chết trên production.
        const r = decide(reqFrom({ origin: 'https://levelup-toeic.onrender.com' }), {});
        expect(r.err).toBeNull();
        expect(r.opts.origin).toBe(true);
    });

    test('same-origin đúng trên domain BẤT KỲ, không cần đổi env', () => {
        const r = decide(reqFrom({ origin: 'https://vi-du-khac.com', host: 'vi-du-khac.com' }), {});
        expect(r.err).toBeNull();
        expect(r.opts.origin).toBe(true);
    });

    test('request không có Origin (GET same-origin) vẫn qua', () => {
        const r = decide(reqFrom({ origin: undefined, method: 'GET' }), {});
        expect(r.err).toBeNull();
        expect(r.opts.origin).toBe(true);
    });

    test('origin LẠ vẫn bị chặn — nới cho chính mình không phải mở toang', () => {
        const r = decide(reqFrom({ origin: 'https://ke-tan-cong.com' }), {});
        expect(r.err).toBeInstanceOf(Error);
        expect(r.err.message).toMatch(/ke-tan-cong\.com/);
    });

    test('CORS_ORIGIN vẫn dùng được khi tách frontend sang host riêng', () => {
        const env = { CORS_ORIGIN: 'https://app.vercel.app, https://www.mien.com' };
        expect(decide(reqFrom({ origin: 'https://app.vercel.app' }), env).err).toBeNull();
        expect(decide(reqFrom({ origin: 'https://www.mien.com' }), env).err).toBeNull();
        expect(decide(reqFrom({ origin: 'https://khong-khai.com' }), env).err).toBeInstanceOf(Error);
    });

    test('đặt CORS_ORIGIN KHÔNG được vô hiệu hoá origin của chính app', () => {
        // Bẫy dễ mắc: khai một host riêng rồi vô tình khoá chính mình ra ngoài.
        const env = { CORS_ORIGIN: 'https://app.vercel.app' };
        const r = decide(reqFrom({ origin: 'https://levelup-toeic.onrender.com' }), env);
        expect(r.err).toBeNull();
    });

    test('localhost dev vẫn chạy khi không khai gì', () => {
        for (const o of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
            const r = decide(reqFrom({ origin: o, host: 'localhost:5000', protocol: 'http' }), {});
            expect(r.err).toBeNull();
        }
    });

    test('protocol lấy theo X-Forwarded-Proto, không phải kết nối tới proxy', () => {
        // Sau reverse proxy của Render, kết nối tới app là http nhưng trình duyệt
        // gửi Origin https. So chuỗi thô mà không tôn trọng trust proxy là lệch
        // scheme và chặn nhầm chính mình.
        const r = decide(reqFrom({ origin: 'https://levelup-toeic.onrender.com', protocol: 'https' }), {});
        expect(r.err).toBeNull();
    });
});
