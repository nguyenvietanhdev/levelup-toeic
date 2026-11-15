/** Cấu hình dùng chung giữa script khởi động và các test E2E. */
module.exports = {
    CONG: 5055,
    // Tài khoản chỉ tồn tại trong MongoDB tạm của E2E, mất khi chạy xong.
    TAI_KHOAN: { email: 'e2e@example.com', matKhau: 'E2e-Mat-Khau-123', level: 60 },
    // Tài khoản quản trị cho test trang admin, cũng chỉ có trong MongoDB tạm.
    TAI_KHOAN_ADMIN: { email: 'admin-e2e@example.com', matKhau: 'E2e-Quan-Tri-456' },
};
