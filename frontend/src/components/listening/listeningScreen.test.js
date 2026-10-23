/**
 * Nghe với AI: màn đã đăng ký và có trong menu; đoạn gốc chỉ hiện SAU khi nộp bài;
 * âm thanh đi qua đường dẫn riêng (không lộ chữ).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(__dirname, 'ListeningScreen.jsx'), 'utf8');
const api = readFileSync(join(__dirname, '..', '..', 'api', 'listening.js'), 'utf8');
const app = readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8');
const menu = readFileSync(join(__dirname, '..', '..', 'layouts', 'SideMenu.jsx'), 'utf8');

describe('màn Nghe với AI', () => {
    test('đã đăng ký trong App và có mục trong menu', () => {
        expect(app).toMatch(/'listening-screen': ListeningScreen/);
        expect(menu).toMatch(/screen: 'listening-screen'/);
        expect(menu).toMatch(/title: 'Nghe với AI'/);
    });

    test('đoạn gốc chỉ hiện trong kết quả sau khi nộp', () => {
        // Phần hiển thị đoạn gốc nằm TRONG nhánh có kết quả (ketQua), không ở form nhập.
        const i = screen.indexOf('Đoạn gốc');
        const nhanh = screen.indexOf('ketQua ? (');
        expect(i).toBeGreaterThan(-1);
        expect(nhanh).toBeGreaterThan(-1);
        expect(i).toBeGreaterThan(nhanh);
    });

    test('âm thanh lấy qua audioUrl, không đưa chữ vào giao diện trước khi chấm', () => {
        expect(screen).toMatch(/ListeningAPI\.audioUrl\(phien\.id, tocDo\)/);
        expect(screen).not.toMatch(/phien\.passage/);
    });

    test('đổi tốc độ đọc làm đổi src nên đoạn được đọc lại từ đầu', () => {
        expect(screen).toMatch(/key=\{`\$\{phien\.id\}-\$\{tocDo\}`\}/);
    });
});

describe('API nghe', () => {
    test('gọi đúng đường dẫn start, grade và audio', () => {
        expect(api).toMatch(/\/listening\/start/);
        expect(api).toMatch(/\/listening\/\$\{encodeURIComponent\(id\)\}\/grade/);
        expect(api).toMatch(/\/api\/listening\/\$\{encodeURIComponent\(id\)\}\/audio/);
    });
});
