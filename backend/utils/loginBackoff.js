// ===================================
// LOGIN BACKOFF
// ===================================
// Nhập sai bao nhiêu lần thì phải chờ bao lâu. Tách thuần để test được, và để
// luật này nằm ở MỘT chỗ thay vì một chuỗi if lồng trong authController.
//
// Vì sao có file này: trước đây tài khoản admin được MIỄN TRỪ hoàn toàn khỏi
// cơ chế khoá theo số lần sai (`if (user.role !== 'admin')` bọc cả khối). Lý do
// miễn trừ là chính đáng — chưa có đường lấy lại tài khoản nếu tự khoá mình —
// nhưng hệ quả là brute-force vào tài khoản quyền cao nhất chỉ còn rate limiter
// theo IP chặn, mà IP thì xoay được. Xem SEC-be.auth-001.
//
// Cách giải: admin VẪN bị backoff, nhưng có TRẦN. Chờ tối đa 5 phút thì không
// bao giờ tự nhốt mình vĩnh viễn, trong khi kẻ tấn công chỉ còn ~12 lần thử mỗi
// giờ dù có xoay IP — đủ để brute-force là bất khả thi mà không cần OTP.

/**
 * Người dùng thường: khoá dài dần, tối đa 60 phút.
 * Mốc [số lần sai, số phút khoá], xét từ cao xuống.
 */
const USER_SCHEDULE = [[20, 60], [15, 30], [10, 15], [5, 5]];

/**
 * Admin: cùng cơ chế nhưng TRẦN 5 phút.
 *
 * Trần này là điểm mấu chốt của cả thiết kế. Không có nó thì bỏ miễn trừ đồng
 * nghĩa với việc chủ dự án gõ sai mật khẩu 20 lần là mất quyền admin 1 tiếng,
 * mà không có đường nào lấy lại — đúng rủi ro đã khiến miễn trừ tồn tại.
 */
const ADMIN_SCHEDULE = [[10, 5], [5, 1]];

/** Trần khoá của admin, phút. Đổi số này là đổi cam kết "không bao giờ tự nhốt mình". */
const ADMIN_MAX_LOCK_MINUTES = 5;

/**
 * Số phút phải khoá sau `attempts` lần nhập sai. 0 = chưa khoá.
 *
 * @param {number} attempts  số lần sai tích luỹ (đã tính lần hiện tại)
 * @param {string} role      'admin' hoặc khác
 * @returns {number} số phút khoá
 */
function lockMinutesFor(attempts, role) {
    const n = Number(attempts) || 0;
    const schedule = role === 'admin' ? ADMIN_SCHEDULE : USER_SCHEDULE;
    for (const [threshold, minutes] of schedule) {
        if (n >= threshold) return minutes;
    }
    return 0;
}

module.exports = {
    lockMinutesFor,
    USER_SCHEDULE,
    ADMIN_SCHEDULE,
    ADMIN_MAX_LOCK_MINUTES,
};
