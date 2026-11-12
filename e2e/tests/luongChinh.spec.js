/**
 * Luồng chính chạy trên trình duyệt thật, server thật, MongoDB tạm.
 *
 * Chọn những luồng KHÔNG cần AI (kho viết tay): chạy ổn định, không tốn tiền, không phụ thuộc
 * mạng. Bắt đúng loại lỗi mà test đơn vị không thấy: build hỏng làm trắng trang, route hay CSP
 * chặn request, nút bấm không nối với API, bố cục điện thoại che mất nút.
 */
const path = require('path');
const { test, expect } = require('@playwright/test');
const { dangNhap, moMuc } = require('./troGiup');

// Kho câu Phản xạ của backend: lấy đáp án đúng cho câu đang hiện, khỏi phải gọi AI chấm.
const { TAT_CA } = require(path.join(__dirname, '..', '..', 'backend', 'services', 'phanXaKho'));

test('đăng nhập bằng form thật và vào được trang chủ', async ({ page }) => {
    await dangNhap(page);
    await expect(page.getByRole('button', { name: 'Phản xạ câu', exact: true })).toBeAttached();
});

test('tra công thức ngữ pháp: gõ không dấu vẫn ra, mở được nội dung', async ({ page }) => {
    await dangNhap(page);
    await moMuc(page, 'Ôn thi', 'Công thức ngữ pháp');
    await page.getByLabel('Tìm công thức ngữ pháp').fill('hien tai don');
    const muc = page.getByRole('button', { name: /Hiện tại đơn/ }).first();
    await expect(muc).toBeVisible();
    await muc.click();
    await expect(page.getByText('Khi nào dùng').first()).toBeVisible();
});

test('Phản xạ câu: gõ đúng câu trong kho thì được chấm đúng', async ({ page }) => {
    await dangNhap(page);
    await moMuc(page, 'Học hôm nay', 'Phản xạ câu');
    // Nhãn nút đổi theo trạng thái: "Luyện 12 câu" khi có câu mới/đến hạn.
    await page.getByRole('button', { name: /^(Luyện \d+ câu|Bắt đầu luyện)$/ }).first().click();

    // Câu tiếng Việt đang hỏi → câu tiếng Anh mẫu trong kho.
    const cauVi = (await page.locator('.px-vi').first().innerText()).trim();
    const cau = TAT_CA.find((c) => c.vi === cauVi);
    expect(cau, `Không tìm thấy câu "${cauVi}" trong kho`).toBeTruthy();

    await page.getByPlaceholder('Hoặc gõ tại đây…').fill(cau.en);
    await page.getByPlaceholder('Hoặc gõ tại đây…').press('Enter');
    await expect(page.getByText('Đúng rồi')).toBeVisible();
    await expect(page.getByText(cau.en).first()).toBeVisible();
});
