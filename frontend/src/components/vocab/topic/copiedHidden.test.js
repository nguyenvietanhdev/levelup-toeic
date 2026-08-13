/**
 * Sao chép xong thì THẺ GỐC biến khỏi danh sách.
 *
 * Grant vẫn còn sau khi chép, nên `sharedTopics` vẫn trả bộ đó về. Không đánh
 * dấu thì tải lại xong thẻ vẫn nằm nguyên đấy — người dùng bấm tiếp và mỗi lần
 * lại tạo thêm một bản `-copy`, rồi `-copy-copy`.
 *
 * Hai chỗ dễ sai, cả hai đều là bẫy closure:
 *   1. `loadPersonal` là useCallback deps RỖNG — đọc `copied` qua state thì
 *      closure giữ tập của lần render đầu và lọc theo tập rỗng mãi mãi.
 *   2. `setCopied` chỉ xếp hàng một lần render, mà `loadPersonal()` chạy NGAY
 *      sau đó — effect đồng bộ ref chưa kịp chạy nên ref vẫn là tập cũ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'useTopics.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

describe('ẩn bộ đã sao chép', () => {
    test('lọc bộ đã chép khỏi danh sách', () => {
        expect(src).toMatch(/\.filter\(t => !copiedRef\.current\.has\(/);
    });

    test('đọc qua REF, không qua state — loadPersonal có deps rỗng', () => {
        expect(src).toMatch(/copiedRef\.current\.has/);
        expect(src).not.toMatch(/copied\.has\(/);
    });

    test('cập nhật ref TRƯỚC khi tải lại, không đợi effect', () => {
        const i = src.indexOf('copiedRef.current = new Set(copiedRef.current).add');
        const j = src.indexOf('await loadPersonal()', i);
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
    });

    test('khoá gồm CẢ chủ sở hữu, không chỉ tên bộ', () => {
        // Hai người cùng chia sẻ bộ trùng tên thì chép một cái phải không ẩn cái kia.
        expect(src).toMatch(/\$\{ownerEmail\}\|\$\{source\}/);
    });

    test('chỉ ẩn khi chép THÀNH CÔNG', () => {
        const i = src.indexOf('if (res?.success)');
        const j = src.indexOf('copiedRef.current = new Set', i);
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
    });

    test('tự kiểm: đọc được nội dung thật', () => {
        expect(src.length).toBeGreaterThan(2000);
        expect(src).toMatch(/copySharedSource/);
    });
});
