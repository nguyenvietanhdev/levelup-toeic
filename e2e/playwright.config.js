// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { CONG } = require('./caiDat');

/**
 * E2E: trình duyệt thật bấm qua app chạy trên server thật + MongoDB tạm (xem khoiDong.js).
 * Chạy: `npm run test:e2e` ở thư mục gốc (cần `npm run build` trước).
 */
module.exports = defineConfig({
    testDir: './tests',
    timeout: 45_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list']],
    use: {
        baseURL: `http://127.0.0.1:${CONG}`,
        locale: 'vi-VN',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'may-tinh', use: { ...devices['Desktop Chrome'] } },
        { name: 'dien-thoai', use: { ...devices['Pixel 7'] } },
    ],
    webServer: {
        command: 'node khoiDong.js',
        cwd: __dirname,
        url: `http://127.0.0.1:${CONG}/health`,
        timeout: 120_000,
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'pipe',
    },
    outputDir: './ket-qua',
});
