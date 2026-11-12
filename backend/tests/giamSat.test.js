/**
 * Giám sát lỗi (Sentry).
 *
 * Chỗ dễ hỏng: gửi mật khẩu/bài làm/cookie/email của người dùng sang dịch vụ ngoài; bật Sentry
 * làm sập server khi thiếu cấu hình; CSP mở quá rộng cho frontend gửi lỗi.
 */
jest.mock('@sentry/node', () => ({
    init: jest.fn(),
    setupExpressErrorHandler: jest.fn(),
    captureException: jest.fn(),
    flush: jest.fn(async () => true),
}));
const Sentry = require('@sentry/node');
const fs = require('fs');
const path = require('path');

beforeEach(() => jest.clearAllMocks());

describe('làm sạch sự kiện trước khi gửi', () => {
    const { lamSach } = require('../utils/giamSat');
    test('bỏ thân request, cookie, query, header xác thực; người dùng chỉ giữ id', () => {
        const e = lamSach({
            request: {
                url: '/api/auth/login',
                data: { email: 'a@b.c', password: 'bi-mat' },
                cookies: { token: 'x' },
                query_string: 'token=abc',
                headers: { Authorization: 'Bearer xyz', Cookie: 'a=b', 'user-agent': 'UA' },
            },
            user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
        });
        expect(e.request).toEqual({ url: '/api/auth/login', headers: { 'user-agent': 'UA' } });
        expect(e.user).toEqual({ id: 'u1' });
        expect(JSON.stringify(e)).not.toMatch(/bi-mat|a@b\.c|Bearer|1\.2\.3\.4/);
    });
    test('không có người dùng hay request thì giữ nguyên phần còn lại', () => {
        expect(lamSach({ message: 'x' })).toEqual({ message: 'x' });
        expect(lamSach({ user: { email: 'a@b.c' } }).user).toBeUndefined();
    });
});

describe('bật / tắt', () => {
    test('không có DSN: không bật, không gọi Sentry, báo lỗi là bỏ qua', async () => {
        jest.isolateModules(() => {
            const g = require('../utils/giamSat');
            expect(g.batGiamSat({})).toBe(false);
            g.ganVaoExpress({});
        });
        expect(Sentry.init).not.toHaveBeenCalled();
        expect(Sentry.setupExpressErrorHandler).not.toHaveBeenCalled();
    });
    test('có DSN: bật, không đo hiệu năng, không gửi PII, gắn bộ làm sạch; báo lỗi rồi chờ gửi xong', async () => {
        let g;
        jest.isolateModules(() => { g = require('../utils/giamSat'); });
        expect(g.batGiamSat({ SENTRY_DSN: 'https://k@o1.ingest.us.sentry.io/2', NODE_ENV: 'production' })).toBe(true);
        expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({
            environment: 'production', tracesSampleRate: 0, sendDefaultPii: false, beforeSend: g.lamSach,
        }));
        const app = {};
        g.ganVaoExpress(app);
        expect(Sentry.setupExpressErrorHandler).toHaveBeenCalledWith(app);
        const loi = new Error('sập');
        await g.baoLoiVaCho(loi);
        expect(Sentry.captureException).toHaveBeenCalledWith(loi);
        expect(Sentry.flush).toHaveBeenCalled();
    });
});

describe('CSP cho frontend gửi lỗi', () => {
    const { originCuaDsn } = require('../utils/giamSat');
    test('chỉ mở đúng host nhận lỗi của DSN; DSN hỏng hay không phải https thì không mở gì', () => {
        expect(originCuaDsn('https://abc@o123.ingest.us.sentry.io/456')).toBe('https://o123.ingest.us.sentry.io');
        expect(originCuaDsn('')).toBeNull();
        expect(originCuaDsn('http://abc@evil.example/1')).toBeNull();
        expect(originCuaDsn('khong-phai-url')).toBeNull();
    });
    test('server dùng origin của DSN trong connectSrc, gắn Sentry trước errorHandler, báo lỗi trước khi tắt vì sập', () => {
        const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        expect(server).toMatch(/\.\.\.\[giamSat\.originCuaDsn\(SENTRY_DSN_FRONTEND\)\]\.filter\(Boolean\)/);
        expect(server).toMatch(/giamSat\.ganVaoExpress\(app\);\s*app\.use\(errorHandler\);/);
        expect(server).toMatch(/await giamSat\.baoLoiVaCho\(err\);\s*shutdown\('uncaughtException', 1\)/);
        // Bật trước khi nạp express.
        expect(server.indexOf('giamSat.batGiamSat()')).toBeLessThan(server.indexOf("require('express')"));
    });
});
