/**
 * Khoảng điểm hiện cho người học thay vì một con số band đứng một mình.
 *
 * AI chấm cùng một bài nhiều lần không ra đúng một số. Độ lệch dưới đây lấy từ bộ đo
 * `backend/eval/chamViet` (chấm mỗi bài mẫu nhiều lần): band tổng lệch tối đa 0.5 giữa các lần
 * với hãng/model đang dùng (đo 2026-11-12, deepseek-chat). Đổi hãng/model hay sửa prompt chấm
 * thì chạy lại bộ đo và cập nhật số này.
 */
export const DO_LECH_BAND = 0.5;

const kep = (x) => Math.min(9, Math.max(0, Math.round(x * 2) / 2));

/** `{ thap, cao }` quanh band (thang 0–9, bước 0.5); `null` khi không có điểm (thuần). */
export function khoangBand(band, lech = DO_LECH_BAND) {
    const b = Number(band);
    if (!Number.isFinite(b)) return null;
    return { thap: kep(b - lech), cao: kep(b + lech) };
}

/** Chuỗi hiển thị, ví dụ "6.0–7.0" (luôn một chữ số thập phân để hai đầu thẳng hàng). */
export function chuoiKhoang(band, lech = DO_LECH_BAND) {
    const k = khoangBand(band, lech);
    return k ? `${k.thap.toFixed(1)}–${k.cao.toFixed(1)}` : '';
}
