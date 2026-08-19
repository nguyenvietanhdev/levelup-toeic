/**
 * Phiên âm câu ví dụ trong chế độ Trắc nghiệm.
 *
 * Cấu trúc đã đổi: trước đây câu ví dụ hiện SẴN từ đầu (`exampleHtml`) và có một
 * nhánh riêng cho chế độ đảo chiều để che đáp án. Giờ câu ví dụ chỉ hiện SAU khi
 * trả lời, dưới 4 ô đáp án — nên chỉ còn MỘT đường: `revealExample`.
 *
 * Ba chỗ dễ hỏng, cả ba đều im lặng:
 *   1. `await` trước khi render → câu hỏi đứng chờ một request mạng.
 *   2. Không kiểm câu hỏi đã đổi chưa → phiên âm câu TRƯỚC hiện dưới câu SAU
 *      (người dùng bấm "Tiếp" nhanh hơn mạng trả lời).
 *   3. Gọi Google cho câu tiếng Anh → tốn một request mỗi câu mà luôn trả rỗng.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'modes', 'multipleChoice.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Thân hàm `revealExample` — nơi mọi việc liên quan đến câu ví dụ diễn ra. */
const reveal = (() => {
    const i = src.indexOf('revealExample(question) {');
    expect(i).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('\n    },', i));
})();

describe('không chặn việc hiện câu hỏi', () => {
    test('KHÔNG await khi lấy phiên âm', () => {
        // `await` ở đây là người học nhìn màn chờ Google trả lời.
        expect(reveal).toMatch(/layPinyinCau\(cau\)\.then\(/);
        expect(reveal).not.toMatch(/await layPinyinCau/);
    });

    test('ô phiên âm có sẵn trong markup, điền sau', () => {
        expect(reveal).toMatch(/id="mc-example-pinyin"/);
    });

    test('ô rỗng thì KHÔNG chiếm chỗ', () => {
        // Không ẩn thì khối ví dụ cao thêm một dòng trống lúc chưa tải xong.
        expect(css).toMatch(/\.word-info-example-pinyin:empty\s*\{[^}]*display:\s*none/);
    });
});

describe('không để phiên âm câu CŨ hiện dưới câu MỚI', () => {
    test('ghi lại chỉ số lúc gọi rồi so lại trước khi ghi', () => {
        expect(reveal).toMatch(/const idxLucGoi = this\.currentIndex/);
        expect(reveal).toMatch(/this\.currentIndex !== idxLucGoi/);
    });
});

describe('không lộ đáp án', () => {
    test('câu ví dụ CHỈ hiện sau khi trả lời', () => {
        // Câu ví dụ chứa chính từ đang hỏi — "多少钱?" lộ thẳng đáp án 多少.
        // Phiên âm cũng vậy: "Duōshǎo qián?" lộ y hệt. Cả hai cùng nằm trong
        // `revealExample`, mà hàm này chỉ gọi từ `handleAnswer`.
        const iReveal = src.indexOf('this.revealExample(question)');
        const iAnswer = src.indexOf("afterAnswer(this, 'multiple-choice')");
        expect(iReveal).toBeGreaterThan(-1);
        expect(iReveal).toBeLessThan(iAnswer);
    });

    test('KHÔNG gọi trong lúc dựng câu hỏi', () => {
        const iShow = src.indexOf('showQuestion() {');
        const iAttach = src.indexOf('this.attachListeners();', iShow);
        expect(src.slice(iShow, iAttach)).not.toMatch(/revealExample/);
    });
});

describe('chỉ gọi khi CẦN', () => {
    test('bỏ qua khi từ không có câu ví dụ', () => {
        expect(reveal).toMatch(/if \(!cau \|\|/);
    });

    test('câu tiếng Anh không tốn request', () => {
        // `layPinyinCau` tự kiểm chữ Hán và trả '' ngay, không gọi mạng —
        // xem `sentencePinyin.test.js`.
        const lib = readFileSync(
            join(__dirname, '..', '..', 'lib', 'sentencePinyin.js'), 'utf8');
        expect(lib).toMatch(/if \(!cau \|\| !coChuHan\(cau\)\) return ''/);
    });
});

describe('nút trên dòng câu ví dụ', () => {
    test('nút dịch đứng TRƯỚC nút loa', () => {
        // Đọc hiểu rồi mới nghe là thứ tự tự nhiên hơn.
        expect(reveal.indexOf('id="translate-example-btn"'))
            .toBeLessThan(reveal.indexOf('id="speak-example-btn"'));
    });

    test('nút dịch phát sự kiện, không gọi thẳng React', () => {
        // Chế độ luyện tập dựng HTML thuần, không gọi được `setTranslateText`.
        expect(reveal).toMatch(/EventBus\.emit\(GameEvents\.TRANSLATE_REQUESTED/);
    });
});
