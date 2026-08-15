/**
 * Chỉ nạp bộ icon THẬT SỰ dùng.
 *
 * `all.min.css` kéo theo cả brands (fa-brands-400.woff2, 110 kB) — mà dự án
 * không dùng icon thương hiệu nào. 110 kB tải về rồi không bao giờ dựng.
 *
 * Hỏng IM LẶNG theo chiều ngược lại: nếu sau này ai đó thêm một icon `fab`
 * (vd nút "Đăng nhập bằng Google") thì icon đó hiện ra ô vuông trống — không
 * lỗi console, không cảnh báo build. Test dưới bắt đúng trường hợp đó.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const index = readFileSync(join(__dirname, 'index.css'), 'utf8');
const SRC = join(__dirname, '..', '..');

/** Mọi file mã nguồn (jsx/js) trong src/. */
function allSources(dir = SRC, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            if (name === 'node_modules') continue;
            allSources(p, out);
        } else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) {
            // CHỈ quét mã nguồn, không quét .css: chuỗi "fa-brands" còn xuất
            // hiện trong chính lời chú thích giải thích vì sao không nạp brands.
            out.push(p);
        }
    }
    return out;
}

describe('không nạp bộ icon thừa', () => {
    test('KHÔNG dùng all.min.css (kéo theo brands 110 kB)', () => {
        expect(index).not.toMatch(/fontawesome-free\/css\/all(\.min)?\.css/);
    });

    test('nạp riêng lõi + solid + regular', () => {
        for (const part of ['fontawesome.min.css', 'solid.min.css', 'regular.min.css']) {
            expect(index, `thiếu ${part}`).toContain(part);
        }
    });

    test('KHÔNG nạp brands', () => {
        expect(index).not.toMatch(/brands(\.min)?\.css/);
    });
});

describe('giả định "không dùng brands" vẫn đúng', () => {
    test('không có class `fab` nào trong mã nguồn', () => {
        // Thêm một icon brand mà quên nạp CSS thì nó hiện ra ô vuông trống —
        // không lỗi console, không cảnh báo build. Test này là thứ duy nhất bắt được.
        const offenders = [];
        for (const f of allSources()) {
            const src = readFileSync(f, 'utf8');
            // `fab fa-...` hoặc `fa-brands`
            if (/\bfab\s+fa-|\bfa-brands\b/.test(src)) offenders.push(f.replace(SRC, 'src'));
        }
        expect(offenders, `dùng icon brands nhưng CSS brands không được nạp:\n${offenders.join('\n')}`)
            .toHaveLength(0);
    });
});
