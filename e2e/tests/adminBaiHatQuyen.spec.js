/**
 * Admin cho một tài khoản dùng Học qua bài hát ngay trong trang admin (không phải sửa biến môi
 * trường rồi triển khai lại), người đó thấy mục trong menu, admin gỡ thì mất.
 */
const { test, expect } = require('@playwright/test');
const { TAI_KHOAN, TAI_KHOAN_ADMIN } = require('../caiDat');
const { dangNhap, trongKhungNhin } = require('./troGiup');

test.skip(({ isMobile }) => isMobile, 'Trang admin chỉ kiểm trên máy tính');

async function moNhomOnThi(page) {
    if (!(await trongKhungNhin(page, page.locator('#side-menu')))) await page.locator('#menu-btn').click();
    const nhom = page.getByRole('button', { name: /Ôn thi & tra cứu/ });
    if ((await nhom.getAttribute('aria-expanded')) !== 'true') await nhom.click();
}

test('admin cho dùng → người học thấy mục Học qua bài hát; gỡ → mất', async ({ page, browser }) => {
    page.on('dialog', (d) => d.accept());
    await page.goto('/dashboard');
    await page.locator('#admin-username').fill(TAI_KHOAN_ADMIN.email);
    await page.locator('#admin-password').fill(TAI_KHOAN_ADMIN.matKhau);
    await page.locator('#admin-login-form button[type="submit"]').click();
    await expect(page.locator('#admin-login-modal')).toBeHidden();

    const nhomCanBang = page.locator('.nav-group-toggle[data-group="balance"]');
    if (!(await page.locator('#nav-group-balance').evaluate((el) => el.classList.contains('open')))) await nhomCanBang.click();
    await page.locator('.sidebar-link[data-main-tab="feature-unlocks"]').click();
    await page.locator('#bh-quyen-email').fill(TAI_KHOAN.email);
    await page.locator('#bh-quyen-form button[type="submit"]').click();
    const hang = page.locator('#bh-quyen-tbody tr', { hasText: TAI_KHOAN.email });
    await expect(hang).toContainText('Thêm ở đây');

    // Người học (trình duyệt riêng) thấy mục mới.
    const ctx = await browser.newContext();
    const hoc = await ctx.newPage();
    await dangNhap(hoc);
    await moNhomOnThi(hoc);
    await expect(hoc.locator('.menu-item[data-screen="bai-hat-screen"]')).toBeVisible();
    await ctx.close();

    // Gỡ quyền.
    await hang.getByRole('button', { name: /Gỡ/ }).click();
    await expect(page.locator('#bh-quyen-tbody')).not.toContainText(TAI_KHOAN.email);

    const ctx2 = await browser.newContext();
    const hoc2 = await ctx2.newPage();
    await dangNhap(hoc2);
    await moNhomOnThi(hoc2);
    await expect(hoc2.locator('.menu-item[data-screen="bai-nghe-screen"]')).toBeVisible();
    await expect(hoc2.locator('.menu-item[data-screen="bai-hat-screen"]')).toHaveCount(0);
    await ctx2.close();
});
