/**
 * Thẻ từ vựng: cụm góc (badge ngôn ngữ + nút tim) của mặt trước KHÔNG được hiện
 * xuyên sang mặt sau.
 *
 * Mặt thẻ có `overflow-y: auto` → Chrome tách thành lớp cuộn riêng, và
 * `backface-visibility: hidden` không còn ẩn được phần tử con định vị. Cụm góc mặt
 * trước hiện ngược gương ở mặt sau ("ZH" thành "HZ", hai nút tim). Sửa bằng cách ẩn
 * cụm góc của mặt đang quay đi theo trạng thái `.flipped`.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

describe('thẻ lật: cụm góc của mặt quay đi bị ẩn', () => {
    test('lật rồi thì ẩn cụm góc mặt trước; chưa lật thì ẩn cụm góc mặt sau', () => {
        expect(css).toMatch(/\.flashcard-inner\.flipped \.flashcard-front \.card-corner-group,\s*\.flashcard-inner:not\(\.flipped\) \.flashcard-back \.card-corner-group\s*\{\s*visibility:\s*hidden;/);
    });

    test('đổi ẩn/hiện lúc thẻ lật được nửa vòng, không giật ngay khi bấm', () => {
        const i = css.indexOf('.card-corner-group {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/transition:\s*visibility 0s linear 0\.3s/);
    });

    test('chừa chỗ cho hàng góc để chữ đầu thẻ không đè lên badge và nút tim', () => {
        expect(css).toMatch(/\.flashcard-front:has\(\.card-corner-group\),\s*\.flashcard-back:has\(\.card-corner-group\)\s*\{\s*padding-top:/);
    });
});
