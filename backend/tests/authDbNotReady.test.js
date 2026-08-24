/**
 * Lỗi DB KHÔNG được biến thành 401.
 *
 * Lỗi thật người dùng gặp: Render free tier ngủ sau 15 phút không có request.
 * Lần vào đầu tiên đánh thức instance, nhưng MongoDB chưa kết nối xong nên
 * `User.findById` ném `MongooseError` — và nhánh `catch` cuối trả 401 cho MỌI
 * lỗi. Client thấy 401 là phát `auth:expired`, XOÁ TOKEN, đăng xuất. Người dùng
 * bị bắt đăng nhập lại sau mỗi lần server ngủ dậy, dù token còn hạn 12 giờ và
 * hoàn toàn hợp lệ.
 *
 * Đây là kiểu lỗi tệ nhất: mọi thứ "đúng" ở từng chỗ, chỉ có ranh giới giữa
 * chúng là sai.
 */
const jwt = require('jsonwebtoken');

jest.mock('../models/User');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const SECRET = 'test-secret';
process.env.JWT_SECRET = SECRET;

/** `req`/`res` giả, đủ để đọc mã trạng thái. */
function gia(token) {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = {
        _status: 0, _body: null,
        status(c) { this._status = c; return this; },
        json(b) { this._body = b; return this; },
    };
    return { req, res, next: jest.fn() };
}

const tokenHopLe = () => jwt.sign({ id: '507f1f77bcf86cd799439011', role: 'user' }, SECRET);

beforeEach(() => jest.clearAllMocks());

describe('lỗi DB → 503, KHÔNG phải 401', () => {
    test('MongooseError khi DB chưa kết nối', async () => {
        const e = new Error('Client must be connected');
        e.name = 'MongooseError';
        User.findById.mockRejectedValue(e);

        const { req, res, next } = gia(tokenHopLe());
        await protect(req, res, next);

        expect(res._status).toBe(503);
        expect(res._body.retryable).toBe(true);
        expect(next).not.toHaveBeenCalled();
    });

    test('lỗi tên bắt đầu bằng "Mongo"', async () => {
        const e = new Error('connection refused');
        e.name = 'MongoNetworkError';
        User.findById.mockRejectedValue(e);

        const { req, res } = gia(tokenHopLe());
        await protect(req, res, jest.fn());
        expect(res._status).toBe(503);
    });

    test('"buffering timed out" — Mongoose xếp hàng rồi bỏ cuộc', async () => {
        // Thông điệp này không có `name` đặc trưng, chỉ nhận ra qua nội dung.
        User.findById.mockRejectedValue(new Error('Operation `users.findOne()` buffering timed out after 10000ms'));

        const { req, res } = gia(tokenHopLe());
        await protect(req, res, jest.fn());
        expect(res._status).toBe(503);
    });
});

describe('lỗi xác thực THẬT vẫn là 401', () => {
    test('token sai chữ ký', async () => {
        const { req, res } = gia(jwt.sign({ id: 'x' }, 'secret-khac'));
        await protect(req, res, jest.fn());
        expect(res._status).toBe(401);
    });

    test('token hết hạn', async () => {
        const het = jwt.sign({ id: 'x' }, SECRET, { expiresIn: '-1s' });
        const { req, res } = gia(het);
        await protect(req, res, jest.fn());
        expect(res._status).toBe(401);
    });

    test('không có token', async () => {
        const { req, res } = gia(null);
        await protect(req, res, jest.fn());
        expect(res._status).toBe(401);
    });

    test('token hợp lệ nhưng user không tồn tại', async () => {
        User.findById.mockResolvedValue(null);
        const { req, res } = gia(tokenHopLe());
        await protect(req, res, jest.fn());
        expect(res._status).toBe(401);
    });
});

describe('phân biệt bằng LOẠI lỗi, không bằng may rủi', () => {
    test('lỗi lạ vẫn 401 — không cho qua thứ không hiểu', () => {
        // Nới lỏng quá tay còn nguy hiểm hơn: lỗi không rõ nguyên nhân mà trả
        // 503 thì một lỗi xác thực thật cũng thành "thử lại sau".
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'middleware', 'auth.js'), 'utf8');
        const i = src.indexOf('const dbChuaSan');
        const sau = src.slice(i);
        expect(sau).toMatch(/status\(401\)/);
        expect(sau).toMatch(/logger\.error/);
    });

    test('lỗi KHÔNG phải DB thì KHÔNG được thành 503', () => {
        // Nới lỏng quá tay còn nguy hiểm hơn bug gốc: nếu mọi lỗi đều thành
        // 503 thì client giữ token và thử lại mãi cho một lỗi thật sự cần đăng
        // nhập lại — người dùng kẹt ở vòng lặp không lối ra.
        const e = new TypeError("Cannot read properties of undefined");
        User.findById.mockRejectedValue(e);

        const { req, res } = gia(tokenHopLe());
        return protect(req, res, jest.fn()).then(() => {
            expect(res._status).toBe(401);
            expect(res._status).not.toBe(503);
        });
    });

    test('có ghi log khi rơi vào nhánh DB', () => {
        // Không log thì lần sau gặp lại vẫn phải dò từ đầu.
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'middleware', 'auth.js'), 'utf8');
        expect(src).toMatch(/logger\.warn\('Auth: DB chưa sẵn sàng/);
    });
});
