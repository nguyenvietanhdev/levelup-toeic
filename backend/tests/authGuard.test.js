/**
 * Unit test — `protect` phải chặn tài khoản BỊ KHOÁ ngay tại request, không đợi
 * token hết hạn.
 *
 * Vì sao cần: khoá tài khoản trước đây chỉ chặn ở bước đăng nhập. Token cấp
 * TRƯỚC lúc khoá vẫn đi lọt, mà JWT_EXPIRE mặc định là 7 ngày — admin bấm khoá,
 * bảng admin hiện "đã khoá", nhưng người đó vẫn thi/tiêu xu/upload cả tuần.
 * `isActive` thì đã chặn đúng từ đầu; đúng 4 dòng bên dưới nó thiếu `isLocked`.
 *
 * Test chạy thuần, không DB: mock model User và jsonwebtoken.
 */
// Factory tường minh chứ không để jest tự dựng: automock của jsonwebtoken không
// dựng ra hàm giả cho `verify` (module export theo kiểu jest không suy được).
jest.mock('jsonwebtoken', () => ({ verify: jest.fn(), sign: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn() }));

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const HOUR = 3600 * 1000;

/** req/res/next giả — res ghi lại status + body để assert. */
function mkCtx(token = 'valid-token') {
    const res = {
        statusCode: null,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
    return {
        req: { headers: { authorization: `Bearer ${token}` } },
        res,
        next: jest.fn(),
    };
}

const baseUser = (over = {}) => ({
    _id: 'u1',
    role: 'user',
    isActive: true,
    isLocked: false,
    lockUntil: null,
    bypassFeatureLock: false,
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    jwt.verify.mockReturnValue({ id: 'u1' });
});

describe('protect — tài khoản bình thường', () => {
    test('token hợp lệ + tài khoản bật → cho qua', async () => {
        User.findById.mockResolvedValue(baseUser());
        const { req, res, next } = mkCtx();

        await protect(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeNull();
        expect(req.user.id).toBe('u1');
    });

    test('không có token → 401', async () => {
        const { res, next } = mkCtx();
        const req = { headers: {} };

        await protect(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
    });

    test('tài khoản bị vô hiệu hoá → 401', async () => {
        User.findById.mockResolvedValue(baseUser({ isActive: false }));
        const { req, res, next } = mkCtx();

        await protect(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
    });
});

describe('protect — khoá tài khoản (lỗ hổng đã vá)', () => {
    test('admin khoá → 423 NGAY, dù token còn hạn', async () => {
        User.findById.mockResolvedValue(baseUser({ isLocked: true }));
        const { req, res, next } = mkCtx();

        await protect(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(423);          // khớp login → frontend tự đăng xuất
        expect(res.body.locked).toBe(true);
        expect(res.body.lockType).toBe('admin');
    });

    test('khoá tạm còn hạn → 423 kèm thời điểm hết khoá', async () => {
        const until = new Date(Date.now() + HOUR);
        User.findById.mockResolvedValue(baseUser({ lockUntil: until }));
        const { req, res, next } = mkCtx();

        await protect(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(423);
        expect(res.body.lockType).toBe('temp');
        expect(res.body.lockUntil).toEqual(until);
    });

    test('khoá tạm đã hết hạn → cho qua bình thường', async () => {
        User.findById.mockResolvedValue(baseUser({ lockUntil: new Date(Date.now() - HOUR) }));
        const { req, res, next } = mkCtx();

        await protect(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeNull();
    });

    test('admin bị khoá vẫn qua — miễn trừ có chủ ý, khớp với login', async () => {
        // Chưa có đường lấy lại tài khoản admin nếu tự khoá mình. Bỏ miễn trừ
        // này thì phải kèm backoff + OTP, và test này phải đổi theo.
        User.findById.mockResolvedValue(baseUser({ role: 'admin', isLocked: true }));
        const { req, res, next } = mkCtx();

        await protect(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeNull();
    });
});

describe('authorize', () => {
    test('thiếu protect phía trước → 401, KHÔNG phải 500', async () => {
        // Đọc req.user.role khi req.user undefined sẽ ném TypeError → errorHandler
        // trả 500, che mất lỗi gắn thiếu middleware thành "lỗi server".
        const res = mkCtx().res;
        const next = jest.fn();

        authorize('admin')({}, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
    });

    test('sai vai trò → 403', () => {
        const res = mkCtx().res;
        const next = jest.fn();

        authorize('admin')({ user: { role: 'user' } }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    test('đúng vai trò → cho qua', () => {
        const res = mkCtx().res;
        const next = jest.fn();

        authorize('admin')({ user: { role: 'admin' } }, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeNull();
    });
});
