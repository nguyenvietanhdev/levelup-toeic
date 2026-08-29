/**
 * "Ôn lại từ sai" — câu GÕ TỪ phải chấm ĐÚNG/SAI thật.
 *
 * Bug đã gặp: `chamFill` dùng thẳng giá trị `GameLogic.checkFillBlank(...)`,
 * mà hàm đó trả OBJECT `{ correct, similarity }` — object luôn truthy, nên MỌI
 * câu trả lời đều được chấm đúng, kể cả gõ một chữ cái.
 *
 * Không có gì gợi ra là sai: popup báo "Chính xác!", điểm vẫn cộng, từ vẫn
 * được đẩy xa hơn trong lịch ôn. Mà đây là chế độ ôn từ ĐÃ SAI — tức là hỏng
 * đúng chỗ cần chấm nghiêm nhất.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'modes', 'reviewMistakes.js'), 'utf8');
const logic = readFileSync(join(__dirname, '..', '..', 'game', 'gameLogic.js'), 'utf8');
const fillBlank = readFileSync(join(__dirname, 'modes', 'fillBlank.js'), 'utf8');

/** Thân `chamFill`, cắt tới hàm kế tiếp. */
const thanChamFill = (() => {
    const i = src.indexOf('chamFill(traLoi) {');
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf('\n    },', i);
    expect(j).toBeGreaterThan(i);
    return src.slice(i, j);
})();

/** `checkFillBlank` + hai hàm nó gọi, dựng từ chính mã nguồn rồi chạy thật. */
const checkFillBlank = (() => {
    const lay = (ten) => {
        const i = logic.indexOf(`    ${ten}(`);
        expect(i, `không tìm thấy ${ten}`).toBeGreaterThan(-1);
        // `+ 6` để lấy CẢ dấu `}` đóng hàm — cắt tới `\n    },` là bỏ mất nó
        // và chuỗi ghép lại thành object không hợp lệ.
        return logic.slice(i, logic.indexOf('\n    },', i) + 6);
    };
    const than = [lay('checkFillBlank'), lay('calculateSimilarity'), lay('levenshteinDistance')]
        .join(',\n');
    return new Function(`const o = { ${than} }; return o.checkFillBlank.bind(o);`)();
})();

describe('`checkFillBlank` trả OBJECT — đây là gốc của bug', () => {
    test('trả object có khoá `correct`, không phải boolean', () => {
        const kq = checkFillBlank('f', 'xin chào');
        expect(typeof kq).toBe('object');
        expect(kq).toHaveProperty('correct');
    });

    test('object đó LUÔN truthy, kể cả khi sai', () => {
        // Chính là lý do bug im lặng: `if (kq)` đúng với mọi câu trả lời.
        const kq = checkFillBlank('f', 'xin chào');
        expect(kq.correct).toBe(false);
        expect(Boolean(kq)).toBe(true);
    });
});

describe('chấm đúng/sai theo nội dung thật', () => {
    test('gõ MỘT chữ cái → SAI', () => {
        // Đúng ca người dùng báo.
        expect(checkFillBlank('f', 'xin chào').correct).toBe(false);
        expect(checkFillBlank('a', 'hello').correct).toBe(false);
    });

    test('gõ đúng hoàn toàn → ĐÚNG', () => {
        expect(checkFillBlank('hello', 'hello').correct).toBe(true);
        expect(checkFillBlank('  Hello  ', 'hello').correct).toBe(true);
    });

    test('thiếu dấu tiếng Việt vẫn được chấp nhận', () => {
        // Ngưỡng 80% cố ý nới cho ca này — gõ không dấu là chuyện thường.
        expect(checkFillBlank('xin chao', 'xin chào').correct).toBe(true);
    });

    test('sai một chữ trong từ ngắn → SAI', () => {
        expect(checkFillBlank('h', 'hi').correct).toBe(false);
        expect(checkFillBlank('ab', 'abc').correct).toBe(false);
    });

    test('chuỗi RỖNG so với chuỗi rỗng ra 100 — vì sao phải chặn ô trống', () => {
        // `calculateSimilarity` có nhánh `longer.length === 0 → 100`.
        expect(checkFillBlank('', '').correct).toBe(true);
    });
});

describe('`chamFill` đọc `.correct`', () => {
    test('destructure `correct`, KHÔNG dùng thẳng giá trị trả về', () => {
        expect(thanChamFill).toMatch(/const \{ correct: dung \} = GameLogic\.checkFillBlank\(/);
    });

    test('không còn gán trần `const dung = GameLogic.checkFillBlank(`', () => {
        // Đây chính là dòng gây bug.
        expect(thanChamFill).not.toMatch(/const dung = GameLogic\.checkFillBlank\(/);
    });
});

describe('ô trống thì không nộp', () => {
    test('`chamFill` chặn chuỗi rỗng TRƯỚC khi chấm', () => {
        const iChan = thanChamFill.indexOf('.trim()');
        const iCham = thanChamFill.indexOf('GameLogic.checkFillBlank(');
        expect(iChan).toBeGreaterThan(-1);
        expect(iChan).toBeLessThan(iCham);
    });

    test('chặn xong thì THOÁT, không chấm tiếp', () => {
        const i = thanChamFill.indexOf('Chưa nhập đáp án');
        expect(i).toBeGreaterThan(-1);
        // Trong khối cảnh báo phải có `return`.
        expect(thanChamFill.slice(i, i + 200)).toMatch(/return;/);
    });

    test('khớp cách chế độ "Điền từ" đã làm', () => {
        // Hai chế độ cùng một thao tác thì phải cư xử giống nhau — lệch nhau
        // là người học gặp hai luật khác nhau cho cùng một việc.
        expect(fillBlank).toMatch(/Chưa nhập đáp án/);
    });
});

describe('các kiểu chấm KHÁC vẫn so boolean thật', () => {
    const than = (ten) => {
        const i = src.indexOf(ten);
        expect(i, `không tìm thấy ${ten}`).toBeGreaterThan(-1);
        return src.slice(i, src.indexOf('\n    },', i));
    };

    test('chọn nghĩa: so phần tử với đáp án', () => {
        expect(than('selectAnswer(index) {'))
            .toMatch(/question\.options\[index\] === question\.correctAnswer/);
    });

    test('đúng/sai: so với `isCorrect`', () => {
        expect(src).toMatch(/const dung = chonDung === question\.isCorrect/);
    });

    test('xếp chữ cái: so chuỗi đã chuẩn hoá', () => {
        expect(src).toMatch(/chuan\(traLoi\) === chuan\(question\.correctAnswer\)/);
    });

    test('phát âm: đọc `.correct` của bộ chấm', () => {
        expect(than('ganPhatAm(question) {')).toMatch(/this\.ketThucCau\(diem\.correct,/);
    });
});
