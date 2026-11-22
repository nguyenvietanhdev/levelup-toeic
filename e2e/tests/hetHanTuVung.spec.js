/**
 * Popup nhắc từ vựng riêng sắp hết hạn: bấm vào một bộ thì sang trang Từ vựng riêng, bộ đó được
 * mở sẵn danh sách từ và tô sáng — không phải tự đi tìm.
 */
const { test, expect } = require('@playwright/test');
const { dangNhap } = require('./troGiup');

test('bấm bộ sắp hết hạn trong popup → mở đúng bộ trong Từ vựng riêng', async ({ page }) => {
    await dangNhap(page);
    // Tạo một bộ hạn 3 ngày (ngưỡng nhắc) bằng chính API của app.
    const nguon = `het-han-${Date.now() % 100000}`;
    const kq = await page.evaluate(async (source) => {
        const token = JSON.parse(localStorage.getItem('authToken') || '{}').token;
        const r = await fetch('/api/upload/vocabulary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ en: 'deadline', vn: 'hạn chót', source, part: 'P1', retentionDays: 3 }),
        });
        return r.json();
    }, nguon);
    expect(kq.success).toBe(true);

    await page.reload();
    const popup = page.getByRole('region', { name: 'Từ vựng riêng sắp hết hạn' });
    await expect(popup).toBeVisible();
    await popup.getByRole('button', { name: new RegExp(nguon) }).click();

    // Sang trang Từ vựng riêng, popup tự ẩn, bộ đó mở sẵn danh sách từ.
    await expect(page.locator('#vocab-screen')).toBeVisible();
    await expect(popup).toHaveCount(0);
    const hang = page.locator(`.topic-row[data-source="${nguon}"]`);
    await expect(hang).toBeVisible();
    await expect(page.locator(`.topic-words[data-source="${nguon}"]`)).toContainText('deadline');

    // Dọn: bộ hạn 3 ngày còn lại thì popup hiện ở các bài sau và có thể che nút của chúng.
    await page.evaluate(async (source) => {
        const token = JSON.parse(localStorage.getItem('authToken') || '{}').token;
        await fetch(`/api/upload/my-source/${encodeURIComponent(source)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    }, nguon);
});
