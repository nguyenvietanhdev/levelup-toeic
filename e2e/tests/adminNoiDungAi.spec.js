/**
 * Trang admin "Nội dung AI": bấm thật qua sidebar → bảng → sửa → ẩn/hiện → thêm → xoá.
 *
 * Bắt loại lỗi test đơn vị không thấy: mục sidebar không mở đúng loại, CSP chặn script mới,
 * route admin chưa gắn vào server, form không gửi được, hộp xác nhận xoá không nối sự kiện.
 */
const { test, expect } = require('@playwright/test');
const { TAI_KHOAN_ADMIN } = require('../caiDat');

// Trang admin làm cho máy tính; đăng nhập admin còn bị giới hạn 5 lần / 15 phút nên chỉ chạy một lần.
test.skip(({ isMobile }) => isMobile, 'Trang admin chỉ kiểm trên máy tính');

test('quản lý nội dung AI: mở từ sidebar, sửa, ẩn/hiện câu luyện; thêm rồi xoá câu ôn lỗi', async ({ page }) => {
    page.on('dialog', (d) => d.accept()); // xác nhận xoá / ẩn

    await page.goto('/dashboard');
    await page.locator('#admin-username').fill(TAI_KHOAN_ADMIN.email);
    await page.locator('#admin-password').fill(TAI_KHOAN_ADMIN.matKhau);
    await page.locator('#admin-login-form button[type="submit"]').click();
    await expect(page.locator('#admin-login-modal')).toBeHidden();

    // Sidebar: nhóm "Nội dung AI" → mục "Câu luyện ngữ pháp".
    const nhom = page.locator('.nav-group-toggle[data-group="ai"]');
    if (!(await page.locator('#nav-group-ai').evaluate((el) => el.classList.contains('open')))) await nhom.click();
    await page.locator('.sidebar-link[data-ai-loai="cau-ngu-phap"]').click();
    await expect(page.locator('#nda-loai')).toHaveValue('cau-ngu-phap');
    const hang = page.locator('#nda-ds tr', { hasText: 'I went home yesterday.' });
    await expect(hang).toBeVisible();
    await expect(hang).toContainText('Quá khứ đơn');

    // Sửa câu đúng.
    await hang.getByRole('button', { name: /Sửa/ }).click();
    await page.locator('#nda-truong [data-key="dung"]').fill('I came home yesterday.');
    await page.locator('#nda-luu').click();
    await expect(page.locator('#nda-modal')).toBeHidden();
    const hangMoi = page.locator('#nda-ds tr', { hasText: 'I came home yesterday.' });
    await expect(hangMoi).toBeVisible();

    // Ẩn rồi hiện lại.
    await hangMoi.getByRole('button', { name: /Ẩn/ }).click();
    await expect(hangMoi).toContainText('Đang ẩn');
    await hangMoi.getByRole('button', { name: /Hiện lại/ }).click();
    await expect(hangMoi).toContainText('Đang dùng');

    // Đổi loại bằng dropdown trong tab: Câu ôn lỗi → thêm một câu.
    await page.locator('#nda-loai').selectOption('cau-on-loi');
    await expect(page.locator('#nda-ds')).toContainText('Chưa có nội dung nào');
    await page.locator('#btn-nda-them').click();
    await page.locator('#nda-truong [data-key="loai"]').selectOption('tense');
    await page.locator('#nda-truong [data-key="lang"]').selectOption('en');
    await page.locator('#nda-truong [data-key="sai"]').fill('Yesterday she go to work.');
    await page.locator('#nda-truong [data-key="chiSai"]').fill('go');
    await page.locator('#nda-truong [data-key="sua"]').fill('went');
    await page.locator('#nda-truong [data-key="dung"]').fill('Yesterday she went to work.');
    await page.locator('#nda-luu').click();
    const cauOn = page.locator('#nda-ds tr', { hasText: 'Yesterday she go to work.' });
    await expect(cauOn).toBeVisible();

    // Xoá hẳn.
    await cauOn.getByRole('button', { name: /Xoá/ }).click();
    await expect(page.locator('#nda-ds')).toContainText('Chưa có nội dung nào');
});
