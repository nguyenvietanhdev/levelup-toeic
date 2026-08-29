/**
 * Khung giờ chạy của từng chế độ — nạp một lần, dùng chung nhiều màn.
 *
 * Song sinh với `featureUnlocks.js`, và cố ý TÁCH RIÊNG: hai thứ khoá theo hai
 * trục khác nhau và người dùng mở chúng bằng hai cách khác nhau. Khoá Level mở
 * được bằng cách cày; khoá giờ thì chỉ có chờ. Gộp một chỗ là lời nhắc nói sai
 * việc cần làm.
 *
 * Server MỚI là chốt chặn thật (`requireInSchedule` ở `/api/practice/start`);
 * đây chỉ để vẽ ổ khoá và nói cho người học biết khi nào quay lại.
 *
 * Trạng thái `dangMo` LẤY TỪ SERVER, không tự tính ở client: máy người dùng có
 * thể lệch múi giờ hoặc đơn giản là sai giờ. Hai bên tính khác nhau thì giao
 * diện báo "đang mở" mà server từ chối — người dùng không hiểu chuyện gì.
 */
import { authHeaders } from '@/auth/token.js';

let _cache = null;      // { bypass, schedules: [{ mode, moTa, dangMo, ... }] }
let _promise = null;

/** Nạp (memoize). `force = true` để nạp lại. */
export function loadSchedules(force = false) {
    if (force) { _cache = null; _promise = null; }
    if (_cache) return Promise.resolve(_cache);
    if (!_promise) {
        _promise = fetch('/api/features/schedules', { headers: authHeaders() })
            .then(r => r.json())
            .then(j => {
                _cache = j?.success ? j.data : { bypass: false, schedules: [] };
                return _cache;
            })
            // Mạng hỏng → KHÔNG lưu cache, và mở đường thử lại.
            //
            // Hai điều tách bạch:
            //   · `_cache` để nguyên `null` — `scheduleInfo` coi đó là "chưa
            //     biết gì" nên không khoá ai. Chặn khi không nạp được là biến
            //     một lỗi mạng thoáng qua thành "mọi chế độ đều khoá"; server
            //     vẫn chặn thật nếu đúng ngoài giờ, nên nới ở client không mở
            //     đường lách nào.
            //   · `_promise` xoá đi để lần gọi sau THỬ LẠI. Giữ lại thì một lần
            //     rớt mạng lúc mở app là cả phiên không bao giờ biết lịch nữa.
            .catch(() => {
                _promise = null;
                return { bypass: false, schedules: [] };
            });
    }
    return _promise;
}

/** Dữ liệu đã nạp (đồng bộ) — `null` nếu chưa nạp xong. */
export function getSchedules() { return _cache; }

/**
 * Trạng thái khung giờ của một chế độ.
 *
 * @param {string} mode
 * @returns {{locked: boolean, moTa: string}} `locked` = đang ngoài giờ.
 *   Chưa nạp, không có lịch, hoặc tài khoản ngoại lệ → coi như mở.
 */
export function scheduleInfo(mode) {
    if (_cache?.bypass) return { locked: false, moTa: '' };
    const s = _cache?.schedules?.find(x => x.mode === mode);
    if (!s) return { locked: false, moTa: '' };
    return { locked: s.dangMo === false, moTa: s.moTa || '' };
}
