/**
 * Không được dùng inline event handler — CSP production chặn thẳng.
 *
 * `script-src-attr 'none'` trong CSP của backend làm MỌI `onclick="..."` viết
 * trong chuỗi HTML thành vô tác dụng. Nút vẫn hiện, vẫn đổi màu khi rê chuột,
 * bấm vào không có gì xảy ra — chỉ một dòng trong console mà server không bao
 * giờ thấy. Lỗi này đã xuất hiện BA lần:
 *
 *   1. nút X đóng sidebar bên admin
 *   2. nút "Quản lý từ vựng" trong modal Từ vựng riêng
 *   3. nút "Nghe lại" (chép chính tả) và "Xóa cụm" (xếp câu)
 *
 * Vá từng chỗ thì lần thứ tư vẫn tái phạm, nên test này quét nguồn.
 *
 * Inline handler còn kéo theo hai vấn đề nữa, thấy rõ ở hai ca vừa sửa:
 *   - phải nhúng DỮ LIỆU vào MÃ (`onclick="speak('${word.example}')"`), chỉ cần
 *     câu có dấu \ hoặc xuống dòng là vỡ cú pháp;
 *   - phải có một global đúng tên đúng lúc (`window.SentenceBuilder`).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : walk(p);
        return /\.(js|jsx)$/.test(name) && !/\.test\.jsx?$/.test(name) ? [p] : [];
    });
}

/** Bỏ comment trước khi quét — không thì chính phần mô tả ở đầu file này khớp
 *  regex và test xanh giả. Đã dính đúng bẫy đó nhiều lần trong dự án. */
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<!--[\s\S]*?-->/g, '')     // comment trong template HTML
        .replace(/^\s*\/\/.*$/gm, '');
}

// `onclick=` trong chuỗi HTML. Không bắt `onClick={...}` của JSX — cái đó React
// gắn bằng addEventListener, hoàn toàn hợp lệ với CSP.
const INLINE_ATTR = /\son(click|change|input|submit|error|load|focus|blur|keyup|keydown)\s*=\s*["'][^"']/i;

const files = walk(SRC);

describe('không inline event handler trong chuỗi HTML', () => {

    test('có file để quét — rỗng thì test này vô nghĩa', () => {
        expect(files.length).toBeGreaterThan(50);
    });

    test('không file nguồn nào còn inline handler', () => {
        const offenders = files
            .map(f => [f.replace(SRC, '').replace(/\\/g, '/'), stripComments(readFileSync(f, 'utf8'))])
            .filter(([, src]) => INLINE_ATTR.test(src))
            .map(([name]) => name);
        // Có tên ở đây = nút đó chết trên production, im lặng.
        expect(offenders).toEqual([]);
    });

    test('tự kiểm: mẫu hỏng PHẢI bị bắt, mẫu đúng PHẢI lọt', () => {
        // Không có case này thì test trên xanh kể cả khi regex sai hoàn toàn.
        expect(INLINE_ATTR.test(`<button onclick="doThing()">x</button>`)).toBe(true);
        expect(INLINE_ATTR.test(`<button onclick='doThing()'>x</button>`)).toBe(true);

        // JSX hợp lệ — React gắn qua addEventListener, CSP không đụng tới.
        expect(INLINE_ATTR.test(`<button onClick={handle}>x</button>`)).toBe(false);
        // data-* là dữ liệu, không phải mã.
        expect(INLINE_ATTR.test(`<button class="js-x" data-text="abc">x</button>`)).toBe(false);
    });
});
