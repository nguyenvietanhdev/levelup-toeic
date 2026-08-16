/**
 * Nav ở nền tối phải ĐẶC, không trong suốt.
 *
 * Trước đây là `rgba(30, 41, 59, 0.95)` — 5% alpha cho nội dung cuộn phía dưới
 * lờ mờ hiện qua. Nhìn rối, nhất là khi cuộn qua ảnh hoặc thẻ nhiều màu.
 *
 * Loại lỗi này KHÔNG lộ ra khi đọc `layout.css`: quy tắc gốc ở đó đã đặc
 * (`var(--bg-primary)`), phải mở thêm `dark-mode.css` mới thấy dòng đè lên nó.
 * Test khoá lại để không ai vô tình thêm alpha vào đây lần nữa.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Bỏ comment trước khi dò — lời chú thích có nhắc `rgba` để giải thích. */
const dark = readFileSync(join(__dirname, 'dark-mode.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const layout = readFileSync(join(__dirname, 'layout.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Thân quy tắc `[data-theme="dark"] .top-nav`. */
const navRule = (() => {
    const m = dark.match(/\[data-theme="dark"\]\s*\.top-nav\s*\{([^}]*)\}/);
    expect(m, 'thiếu quy tắc nav cho nền tối').toBeTruthy();
    return m[1];
})();

describe('nav nền tối: đen tuyền', () => {
    test('KHÔNG dùng rgba/hsla — không có kênh alpha', () => {
        // `rgba(..., 0.95)` là đúng thứ gây ra hiện tượng nhìn xuyên thấu.
        expect(navRule).not.toMatch(/rgba?\(/);
        expect(navRule).not.toMatch(/hsla?\(/);
    });

    test('không hạ opacity cả thanh', () => {
        // `opacity` làm mờ CẢ chữ và icon bên trong, còn tệ hơn nền trong suốt.
        expect(navRule).not.toMatch(/opacity:/);
    });

    test('là màu ĐEN, không phải xanh đen', () => {
        expect(navRule).toMatch(/background:\s*#000\b/);
    });

    test('không có backdrop-filter làm nhoè nền dưới', () => {
        // Làm nhoè cũng là một kiểu xuyên thấu.
        expect(navRule).not.toMatch(/backdrop-filter/);
    });
});

describe('quy tắc gốc vẫn đặc', () => {
    test('layout.css dùng token màu, không alpha', () => {
        // Nền sáng đi theo `--bg-primary` (#FFFFFF) — cũng đặc.
        const m = layout.match(/^\.top-nav\s*\{([^}]*)\}/m);
        expect(m, 'thiếu quy tắc .top-nav gốc').toBeTruthy();
        expect(m[1]).toMatch(/background-color:\s*var\(--bg-primary\)/);
        expect(m[1]).not.toMatch(/rgba?\(/);
    });
});
