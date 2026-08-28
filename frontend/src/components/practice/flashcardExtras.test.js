/**
 * Flashcard: nút dịch và phiên âm cho câu ví dụ / từ đồng nghĩa.
 *
 * Trước đây hai khối này chỉ có nút loa — nghe được nhưng không hiểu, và không
 * biết đọc thế nào. Người học tiếng Trung nhìn `吃饭了。` mà không có pinyin thì
 * nút loa là cách duy nhất, phải nghe đi nghe lại để đoán.
 *
 * Chỗ dễ hỏng nhất: quên `stopPropagation`. Cả thẻ là nút LẬT, nên bấm dịch mà
 * không chặn thì thẻ lật một cái — đúng lúc người ta đang muốn đọc.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'modes', 'flashcard.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('nút dịch', () => {
    test('có ở CẢ HAI khối — ví dụ và từ đồng nghĩa', () => {
        // `data-tr` giờ mang THẲNG nội dung câu (kho song ngữ có hai bộ, tra
        // theo tên khoá luôn ra bộ của mặt kia). Nên soi khối chứa nó.
        expect(src).toMatch(/class="card-example"[\s\S]*?card-translate/);
        expect(src).toMatch(/class="card-synonyms"[\s\S]*?card-translate/);
    });

    test('đứng TRƯỚC nút loa', () => {
        // Đọc hiểu rồi mới nghe. Cùng thứ tự với chế độ Trắc nghiệm — tay quen
        // một chỗ là quen mọi chỗ.
        const i = src.indexOf('card-translate');
        const j = src.indexOf('card-speak"');
        expect(i).toBeGreaterThan(-1);
        expect(i).toBeLessThan(j);
    });

    test('CHẶN nổi bọt — không làm thẻ lật', () => {
        // Cả thẻ là nút lật; bấm dịch mà thẻ lật là mất đúng thứ vừa muốn đọc.
        const i = src.indexOf(".card-translate')");
        const than = src.slice(i, i + 400);
        expect(than).toMatch(/e\.stopPropagation\(\)/);
    });

    test('phát đúng sự kiện dịch của app', () => {
        expect(src).toMatch(/TRANSLATE_REQUESTED, \{ text \}/);
    });

    test('không phát khi nội dung rỗng', () => {
        // Mở popup dịch với chuỗi rỗng thì nó quay vòng rồi báo lỗi.
        const i = src.indexOf(".card-translate')");
        expect(src.slice(i, i + 400)).toMatch(/if \(text\)/);
    });
});

describe('phiên âm', () => {
    test('có chỗ hiện cho CẢ HAI khối', () => {
        // Id nay có hậu tố `-truoc`/`-sau` ở kho song ngữ (mỗi mặt một bộ), nên
        // không neo vào tên đầy đủ nữa.
        expect(src).toMatch(/id="fc-ph-example\$\{hau\}"/);
        expect(src).toMatch(/id="fc-ph-synonyms\$\{hau\}"/);
    });

    test('KHÔNG `await` — không chặn việc hiện thẻ', () => {
        // Đây là thông tin phụ trợ; chờ mạng xong mới vẽ thẻ là đổi một thứ nhỏ
        // lấy cả trải nghiệm.
        const i = src.indexOf('napPhienAm(word) {');
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/layPhienAmCau\(text\)\.then\(/);
        expect(than).not.toMatch(/await layPhienAmCau/);
    });

    test('bỏ kết quả nếu đã sang thẻ khác', () => {
        // Bấm "Tiếp" nhanh hơn mạng thì phiên âm của thẻ trước hiện dưới thẻ sau.
        const i = src.indexOf('napPhienAm(word) {');
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/this\.currentIndex !== idxLucGoi/);
    });

    test('dùng hàm CHUNG cho cả hai ngôn ngữ', () => {
        // `layPinyinCau` chỉ phục vụ tiếng Trung — dùng nó thì câu ví dụ tiếng
        // Anh không bao giờ có phiên âm.
        expect(src).toMatch(/layPhienAmCau/);
        expect(src).not.toMatch(/layPinyinCau/);
    });

    test('bỏ qua khối không có nội dung', () => {
        const i = src.indexOf('napPhienAm(word) {');
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/if \(!text\) continue;/);
    });
});

describe('trình bày', () => {
    test('phiên âm nhỏ và mờ hơn nội dung chính', () => {
        // Nó là chỉ dẫn CÁCH ĐỌC, không phải thứ để đọc.
        const i = css.indexOf('.card-extra-phonetic {');
        expect(i).toBeGreaterThan(-1);
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/font-size: 0\.\d+em/);
        expect(rule).toMatch(/opacity/);
    });

    test('ẩn khi rỗng — không chừa dải trống', () => {
        // Thẻ chưa lấy được phiên âm thì không để lại một khoảng trống không
        // hiểu vì sao lại có.
        expect(css).toMatch(/\.card-extra-phonetic:empty \{ display: none; \}/);
    });

    test('CSS khai đúng MỘT lần', () => {
        expect(css.split('.card-extra-phonetic {').length - 1).toBe(1);
    });
});
