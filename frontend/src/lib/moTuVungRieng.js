/**
 * "Lệnh mở" màn Từ vựng riêng tới đúng một bộ từ (vd bấm vào popup nhắc sắp hết hạn).
 *
 * Màn Từ vựng riêng có thể chưa từng được tải (lazy) hoặc đang mở sẵn, nên yêu cầu được giữ lại
 * cho tới khi màn lấy, đồng thời báo ngay cho màn nếu nó đang nghe.
 */
let cho = null;
const nghe = new Set();

/** Ghi yêu cầu mở bộ `nguon` (bỏ trống = chỉ mở tab quản lý). Gọi rồi chuyển màn sang vocab-screen. */
export function yeuCauMoTuVungRieng(nguon = '') {
    cho = { nguon: String(nguon || ''), lan: Date.now() };
    nghe.forEach((f) => f(cho));
}

/** Xem yêu cầu đang chờ, KHÔNG xoá (dùng trong khởi tạo state: StrictMode gọi hai lần). */
export const xemYeuCauTuVungRieng = () => cho;

/** Lấy (và xoá) yêu cầu đang chờ. */
export function layYeuCauTuVungRieng() {
    const c = cho;
    cho = null;
    return c;
}

/** Màn Từ vựng riêng nghe yêu cầu mới khi đang được gắn. Trả hàm huỷ nghe. */
export function ngheYeuCauTuVungRieng(f) {
    nghe.add(f);
    return () => { nghe.delete(f); };
}
