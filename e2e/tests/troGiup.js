/** Thao tác dùng chung cho các test E2E. */
const { expect } = require('@playwright/test');
const { TAI_KHOAN } = require('../caiDat');

/** Đăng nhập bằng form thật (nút Đăng nhập ở đầu menu bên). */
async function dangNhap(page) {
    await page.goto('/');
    // Chờ app tải xong: bấm nút menu trước khi React gắn sự kiện thì không có tác dụng gì.
    await page.waitForLoadState('networkidle');
    await page.locator('#menu-btn').click();
    await page.locator('#login-menu-btn').click();
    await page.locator('#login-email').fill(TAI_KHOAN.email);
    await page.locator('.input-password-wrap input').fill(TAI_KHOAN.matKhau);
    await page.locator('form button[type="submit"]').click();
    // Đã đăng nhập: form đóng và nút Đăng nhập trong menu biến mất. (Huy hiệu "Level" bị ẩn ở
    // khổ điện thoại nên không dùng làm dấu hiệu.)
    await expect(page.locator('#login-email')).toBeHidden();
    await expect(page.locator('#login-menu-btn')).toHaveCount(0);
}

/** Phần tử có nằm TRONG khung nhìn không. Menu đóng là trượt ra ngoài màn hình (x âm), nên
 * "visible" của Playwright vẫn đúng dù người dùng không thấy — phải tự kiểm toạ độ. */
async function trongKhungNhin(page, loc) {
    const b = await loc.boundingBox();
    const v = page.viewportSize();
    return !!b && b.width > 0 && b.x >= 0 && b.x + b.width <= v.width + 1;
}

/**
 * Mở một mục trong menu bên, chạy được cả máy tính lẫn điện thoại: mở menu nếu mục đang ngoài
 * màn hình, chờ menu trượt ra xong, chỉ khi mục vẫn chưa thấy mới mở nhóm (bấm nhóm đang mở là
 * đóng nó lại).
 */
async function moMuc(page, nhom, muc) {
    const nut = page.getByRole('button', { name: muc, exact: true });
    const nhomNut = page.getByRole('button', { name: new RegExp(nhom, 'i') }).first();
    if (!(await trongKhungNhin(page, nhomNut))) {
        await page.locator('#menu-btn').click();
        await expect.poll(() => trongKhungNhin(page, nhomNut)).toBe(true);
    }
    if (!(await nut.isVisible()) || !(await trongKhungNhin(page, nut))) await nhomNut.click();
    await expect.poll(() => trongKhungNhin(page, nut)).toBe(true);
    await nut.click();
}

module.exports = { dangNhap, moMuc };
