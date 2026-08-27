/**
 * Backtick trong comment HTML nằm giữa template string làm VỠ BUILD.
 *
 * Backtick đó đóng chuỗi giữa chừng, phần còn lại của HTML bị đọc như mã JS.
 * Lỗi cú pháp thuần: test nội dung không bắt được, chỉ build mới bắt — mà lúc
 * đó thì đã mất một vòng chạy.
 *
 * Đã xảy ra HAI LẦN ở hai file khác nhau. Lần đầu tôi viết test cho đúng file
 * vừa hỏng; lần sau nó tái diễn ở `flashcard.js` vì test kia không quét tới.
 * Nên bài kiểm phải quét MỌI chế độ, không phải file vừa sửa.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const thuMucModes = join(__dirname, 'modes');

const cacFile = readdirSync(thuMucModes)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));

describe('không có backtick trong comment HTML', () => {
    // Chốt lại số file: thư mục rỗng hoặc đọc nhầm đường dẫn thì vòng lặp
    // không chạy ca nào và test xanh mà chẳng kiểm gì.
    test('quét được toàn bộ chế độ', () => {
        expect(cacFile.length).toBeGreaterThan(10);
    });

    for (const ten of cacFile) {
        test(ten, () => {
            const src = readFileSync(join(thuMucModes, ten), 'utf8');
            // Chỉ soi COMMENT: template string lồng nhau (`.map()` trả chuỗi)
            // dùng backtick hoàn toàn hợp lệ.
            for (const m of src.matchAll(/<!--[\s\S]*?-->/g)) {
                expect(m[0]).not.toContain('`');
            }
        });
    }
});
