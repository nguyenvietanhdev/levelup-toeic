/**
 * GIÁM SÁT LỖI KHI CHẠY THẬT (Sentry) — tự tắt khi chưa có `SENTRY_DSN`.
 *
 * Vì sao cần: lần trang thật treo, log Render không có dòng nào chỉ ra nguyên nhân. Sentry gom lỗi
 * kèm stack trace, gộp lỗi trùng và báo khi có lỗi MỚI.
 *
 * Quyền riêng tư: không gửi thân request (mật khẩu, bài làm), cookie, header xác thực hay email.
 * Chỉ gửi id người dùng để biết lỗi ảnh hưởng bao nhiêu người.
 */
const logger = require('./logger');

let Sentry = null;

/** Header không bao giờ gửi đi. */
const HEADER_BI_MAT = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

/**
 * Làm sạch sự kiện trước khi gửi (thuần): bỏ thân request, cookie, query, header bí mật, và
 * mọi thông tin người dùng trừ id.
 */
function lamSach(event) {
    if (!event || typeof event !== 'object') return event;
    const req = event.request;
    if (req) {
        delete req.data;
        delete req.cookies;
        delete req.query_string;
        if (req.headers) {
            for (const h of Object.keys(req.headers)) {
                if (HEADER_BI_MAT.includes(h.toLowerCase())) delete req.headers[h];
            }
        }
    }
    if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;
    return event;
}

/** Bật Sentry nếu có DSN. Gọi SỚM NHẤT có thể (trước khi nạp express). */
function batGiamSat(env = process.env) {
    if (!env.SENTRY_DSN) return false;
    try {
        Sentry = require('@sentry/node');
        Sentry.init({
            dsn: env.SENTRY_DSN,
            environment: env.NODE_ENV || 'development',
            release: env.RENDER_GIT_COMMIT || undefined,
            // Chỉ cần lỗi, không đo hiệu năng: gói miễn phí giới hạn số sự kiện.
            tracesSampleRate: 0,
            sendDefaultPii: false,
            beforeSend: lamSach,
        });
        logger.info('Sentry: đã bật giám sát lỗi');
        return true;
    } catch (e) {
        Sentry = null;
        logger.warn('Sentry: không bật được, chạy tiếp không giám sát', { error: e.message });
        return false;
    }
}

/** Gắn bắt lỗi của Express — đặt TRƯỚC errorHandler của app. */
function ganVaoExpress(app) {
    if (Sentry) Sentry.setupExpressErrorHandler(app);
}

/** Báo một lỗi chưa bắt rồi chờ gửi xong (tiến trình sắp thoát). Không bật thì bỏ qua. */
async function baoLoiVaCho(err, maxMs = 2000) {
    if (!Sentry) return;
    try {
        Sentry.captureException(err);
        await Sentry.flush(maxMs);
    } catch (_) { /* giám sát lỗi không được làm hỏng việc tắt server */ }
}

/** Origin nhận sự kiện từ DSN, để mở CSP cho frontend gửi lỗi (thuần). */
function originCuaDsn(dsn) {
    try {
        const u = new URL(String(dsn || ''));
        return u.protocol === 'https:' ? `https://${u.host}` : null;
    } catch {
        return null;
    }
}

module.exports = { batGiamSat, ganVaoExpress, baoLoiVaCho, lamSach, originCuaDsn };
