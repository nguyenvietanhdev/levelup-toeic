/**
 * Phiên âm câu ví dụ trong chế độ Trắc nghiệm.
 *
 * Ba chỗ dễ hỏng, cả ba đều im lặng:
 *   1. `await` trước khi render → câu hỏi đứng chờ một request mạng.
 *   2. Không kiểm câu hỏi đã đổi chưa → phiên âm câu TRƯỚC hiện dưới câu SAU
 *      (người dùng bấm "Tiếp" nhanh hơn mạng trả lời).
 *   3. Hiện phiên âm ở chế độ ĐẢO CHIỀU khi chưa trả lời → lộ đáp án, y hệt
 *      việc hiện thẳng câu gốc.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'modes', 'multipleChoice.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('không chặn việc hiện câu hỏi', () => {
    test('KHÔNG await khi gọi', () => {
        // `await` ở đây là người học nhìn màn trắng chờ Google trả lời.
        expect(src).toMatch(/\n\s*this\.fillExamplePinyin\(question, this\.currentIndex\);/);
        expect(src).not.toMatch(/await this\.fillExamplePinyin/);
    });

    test('ô phiên âm có sẵn trong markup, điền sau', () => {
        expect(src).toMatch(/id="mc-example-pinyin"/);
    });

    test('ô rỗng thì KHÔNG chiếm chỗ', () => {
        // Không ẩn thì câu hỏi nhảy một nhịp lúc Google trả về.
        expect(css).toMatch(/\.word-info-example-pinyin:empty\s*\{[^}]*display:\s*none/);
    });
});

describe('không để phiên âm câu CŨ hiện dưới câu MỚI', () => {
    test('nhánh thường kiểm chỉ số trước khi ghi', () => {
        const i = src.indexOf('async fillExamplePinyin');
        const body = src.slice(i, src.indexOf('\n    },', i));
        expect(body).toMatch(/this\.currentIndex !== idx/);
    });

    test('nhánh ĐẢO CHIỀU cũng kiểm', () => {
        // Chỗ này dễ quên vì nó nằm trong `handleAnswer`, xa hàm kia.
        const i = src.indexOf('const idxLucGoi');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 400)).toMatch(/this\.currentIndex !== idxLucGoi/);
    });
});

describe('không lộ đáp án ở chế độ đảo chiều', () => {
    test('KHÔNG lấy phiên âm khi câu hỏi đang đảo chiều', () => {
        // Pinyin của "对不起" là "Duìbùqǐ" — lộ đáp án hệt như hiện chữ Hán.
        const i = src.indexOf('async fillExamplePinyin');
        const body = src.slice(i, src.indexOf('\n    },', i));
        expect(body).toMatch(/if \(question\.reversed\) return;/);
    });

    test('trả lời XONG thì mới hiện', () => {
        // Khối lấy phiên âm phải nằm TRONG nhánh `if (question.reversed && ...)`
        // của `handleAnswer` — tức sau khi người dùng đã chọn đáp án.
        const iIf = src.indexOf('if (question.reversed && question.word.example)');
        const iPinyin = src.indexOf('const idxLucGoi');
        expect(iIf).toBeGreaterThan(-1);
        expect(iPinyin).toBeGreaterThan(iIf);
        // Và phải nằm trước khi khối đó đóng lại.
        expect(iPinyin).toBeLessThan(src.indexOf('afterAnswer(this,', iIf));
    });
});

describe('chỉ gọi khi CẦN', () => {
    test('bỏ qua câu không có chữ Hán', () => {
        // Google trả rỗng cho tiếng Anh; gọi vô ích chỉ tốn một request mỗi câu.
        const i = src.indexOf('async fillExamplePinyin');
        const body = src.slice(i, src.indexOf('\n    },', i));
        expect(body).toMatch(/!coChuHan\(cau\)/);
    });

    test('bỏ qua khi từ không có câu ví dụ', () => {
        const i = src.indexOf('async fillExamplePinyin');
        const body = src.slice(i, src.indexOf('\n    },', i));
        expect(body).toMatch(/if \(!cau \|\|/);
    });
});

describe('trình bày', () => {
    test('phiên âm nhỏ và nhạt hơn câu gốc', () => {
        // Chữ Hán mới là thứ cần đọc; cùng cỡ là hai dòng tranh nhau chú ý.
        const i = css.indexOf('.word-info-example-pinyin {');
        const body = css.slice(i, css.indexOf('}', i));
        const co = Number((body.match(/font-size:\s*(\d+)px/) || [])[1]);
        expect(co).toBeLessThan(17);   // câu gốc 17px
        expect(body).toMatch(/color:\s*var\(--text-secondary/);
    });

    test('KHÔNG nghiêng — câu gốc đã nghiêng rồi', () => {
        const i = css.indexOf('.word-info-example-pinyin {');
        expect(css.slice(i, css.indexOf('}', i))).not.toMatch(/font-style:\s*italic/);
    });
});
