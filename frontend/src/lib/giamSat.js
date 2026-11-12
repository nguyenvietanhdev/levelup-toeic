/**
 * Giám sát lỗi phía trình duyệt (Sentry) — chỉ bật khi server trả DSN.
 *
 * DSN đọc lúc chạy (`/api/giam-sat/cau-hinh`) thay vì nhúng lúc build: đổi DSN chỉ cần sửa biến
 * môi trường trên server. Thư viện Sentry tải TRỄ và chỉ khi có DSN, để người dùng không phải
 * tải thêm gì khi giám sát đang tắt.
 *
 * Quyền riêng tư: không gửi PII, bỏ thân request và breadcrumb chứa nội dung gõ vào ô nhập.
 */

let sentry = null;
const hangCho = [];

/** Làm sạch sự kiện trước khi gửi (thuần). */
export function lamSach(event) {
    if (!event || typeof event !== 'object') return event;
    if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
    }
    if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;
    // Breadcrumb "ui.input" có thể chứa chữ người học đang gõ (bài viết, mật khẩu).
    if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.filter((b) => b?.category !== 'ui.input');
    }
    return event;
}

/**
 * Đọc cấu hình và bật Sentry nếu có DSN. Không đọc được cấu hình hay không tải được thư viện thì
 * im lặng bỏ qua: giám sát lỗi không bao giờ được làm hỏng app.
 */
export async function khoiDongGiamSat({ layCauHinh = () => fetch('/api/giam-sat/cau-hinh').then((r) => r.json()), napThuVien = () => import('@sentry/react') } = {}) {
    try {
        const ch = (await layCauHinh())?.data;
        if (!ch?.dsn) return false;
        const S = await napThuVien();
        S.init({
            dsn: ch.dsn,
            environment: ch.moiTruong || 'production',
            sendDefaultPii: false,
            tracesSampleRate: 0,
            beforeSend: lamSach,
        });
        sentry = S;
        // Lỗi xảy ra trước khi Sentry tải xong vẫn được gửi.
        while (hangCho.length) {
            const [err, ngu] = hangCho.shift();
            S.captureException(err, ngu);
        }
        return true;
    } catch {
        return false;
    }
}

/** Báo một lỗi đã bắt (ví dụ ErrorBoundary). Chưa bật thì giữ lại tối đa vài lỗi chờ. */
export function baoLoi(err, ngu) {
    if (sentry) {
        sentry.captureException(err, ngu);
        return;
    }
    if (hangCho.length < 5) hangCho.push([err, ngu]);
}
