/**
 * QUÉT MÀN: mở lần lượt MỌI màn trong menu, màn nào trắng trang (ErrorBoundary) hay ném lỗi JS
 * thì báo. Sinh ra sau lỗi "useEffect is not defined" làm trắng màn Luyện viết trên production:
 * build vẫn qua vì lỗi chỉ nổ khi màn được mở.
 *
 * Bấm thẳng nút menu bằng JS (không cần mở menu, mở nhóm) vì ở đây chỉ kiểm màn có dựng được
 * không; cách bấm qua giao diện đã có ở luongChinh.spec.js.
 */
const { test, expect } = require('@playwright/test');
const { dangNhap } = require('./troGiup');

/** Lỗi console không phải lỗi app (mạng tới dịch vụ ngoài bị tắt trong E2E). */
const BO_QUA = [/Failed to load resource/i, /net::ERR_/i, /favicon/i];

test('mọi màn trong menu đều dựng được, không trắng trang, không lỗi JS', async ({ page }) => {
    test.setTimeout(180_000);
    await dangNhap(page);
    // Nhóm menu thu gọn thì không dựng mục bên trong: mở hết các nhóm trước khi gom danh sách màn.
    await page.$$eval('button[aria-expanded="false"]', (ds) => ds.forEach((b) => b.click()));
    await page.waitForTimeout(500);
    const man = await page.$$eval('button.menu-item[data-screen]', (ds) => ds.map((b) => ({ screen: b.dataset.screen, ten: b.innerText.trim().split('\n')[0] })));
    expect(man.length).toBeGreaterThan(15);

    const loi = [];
    let dangMo = '';
    page.on('pageerror', (e) => loi.push(`${dangMo}: ${e.message}`));
    page.on('console', (m) => {
        if (m.type() === 'error' && !BO_QUA.some((r) => r.test(m.text()))) loi.push(`${dangMo} (console): ${m.text().slice(0, 200)}`);
    });

    for (const m of man) {
        dangMo = `${m.ten} [${m.screen}]`;
        await page.evaluate((s) => document.querySelector(`button.menu-item[data-screen="${s}"]`)?.click(), m.screen);
        await page.waitForTimeout(1200);
        if (await page.getByText('Đã có lỗi xảy ra').isVisible()) {
            loi.push(`${dangMo}: TRẮNG TRANG (ErrorBoundary)`);
            await page.reload(); // ErrorBoundary giữ trạng thái lỗi: tải lại để quét tiếp màn sau
            await page.waitForLoadState('networkidle');
        }
    }
    expect(loi, `Màn lỗi:\n${loi.join('\n')}`).toEqual([]);
});
