/**
 * Nhãn từ loại ở chế độ luyện "Từ loại".
 *
 * Lỗi người dùng thấy: ô đáp án hiện "数词 数词" — nhãn và chú thích trùng nhau.
 *
 * Vì sao: bảng `TYPE_LABELS_VI` chỉ có khoá tiếng Anh (`noun`, `verb`), trong
 * khi kho tiếng Trung lưu `名词`, `数词`… Giá trị không có trong bảng thì Proxy
 * trả về CHÍNH KEY làm nhãn, rồi template in nó hai lần — một ở `.type-label`,
 * một ở `.type-english`.
 *
 * Hỏng IM LẶNG: không có lỗi nào, chỉ là đáp án đọc ra vô nghĩa với người học.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'wordTypeCheck.js'), 'utf8');

describe('bảng nhãn có đủ từ loại tiếng Trung', () => {
    test('các loại phổ biến đều có nhãn tiếng Việt', () => {
        // Đây là những giá trị thật trong kho zh sau khi chuẩn hoá.
        for (const [zh, vi] of [
            ['名词', 'Danh từ'],
            ['动词', 'Động từ'],
            ['形容词', 'Tính từ'],
            ['副词', 'Trạng từ'],
            ['量词', 'Lượng từ'],
            ['数词', 'Số từ'],
            ['成语', 'Thành ngữ'],
            ['短语', 'Cụm từ'],
        ]) {
            expect(src, `thiếu nhãn cho ${zh}`).toMatch(new RegExp(`'${zh}':\\s*'${vi}'`));
        }
    });

    test('giữ nguyên nhãn tiếng Anh cho kho en', () => {
        expect(src).toMatch(/'noun':\s*'Danh từ'/);
        expect(src).toMatch(/'verb':\s*'Động từ'/);
    });

    test('có nhãn cho "bộ thủ"', () => {
        // 483 từ trong kho zh dùng nhãn này.
        expect(src).toMatch(/'bộ thủ':\s*'Bộ thủ'/);
    });
});

describe('không in trùng nhãn', () => {
    test('dòng phụ chỉ hiện khi KHÁC nhãn chính', () => {
        // Đây là gốc của "数词 数词".
        expect(src).toMatch(/const sub = label === option \? '' :/);
    });

    test('bỏ Proxy trả-về-key làm nhãn', () => {
        // Proxy khiến mọi type lạ tự thành nhãn của chính nó.
        expect(src).not.toMatch(/new Proxy\(TYPE_LABELS_VI/);
    });
});

describe('số đáp án và tính duy nhất', () => {
    const config = readFileSync(
        join(__dirname, '..', '..', '..', 'game', 'config.js'), 'utf8');
    const logic = readFileSync(
        join(__dirname, '..', '..', '..', 'game', 'gameLogic.js'), 'utf8');

    test('đúng 4 lựa chọn, như mọi chế độ trắc nghiệm khác', () => {
        // Trước là 6 với lý do "đủ 6 từ loại cơ bản" — nhưng kho zh có 56 từ
        // loại nên 6 chẳng "đủ", chỉ làm hàng đáp án tràn hai dòng.
        // Neo vào khối CÓ `questionsPerRound` — chuỗi 'word-type-check' còn xuất
        // hiện ở bảng chi phí phía trên, neo nhầm là đọc trúng khối khác.
        const m = config.match(/'word-type-check':\s*\{[^}]*questionsPerRound[^}]*\}/);
        expect(m, 'không tìm thấy khối config của chế độ').toBeTruthy();
        expect(m[0]).toMatch(/optionsCount:\s*4/);
    });

    test('mặc định của hàm sinh cũng là 4', () => {
        expect(logic).toMatch(/generateWordTypeCheck\(word, optionsCount = 4/);
    });

    test('đáp án nhiễu KHÔNG trùng đáp án đúng', () => {
        expect(logic).toMatch(/seen = new Set\(\[correctAnswer\.trim\(\)\.toLowerCase\(\)\]\)/);
    });

    test('bỏ trùng kể cả khi chỉ khác hoa/thường', () => {
        // "Noun" và "noun" là hai chuỗi khác nhau nên `Set` ở nơi gọi không gộp,
        // nhưng với người học đó là MỘT đáp án — hiện hai ô đọc y hệt nhau.
        expect(logic).toMatch(/String\(t \?\? ''\)\.trim\(\)\.toLowerCase\(\)/);
        expect(logic).toMatch(/if \(!key \|\| seen\.has\(key\)\) continue;/);
    });

    test('nguồn quá hẹp thì bù từ loại từ toàn kho', () => {
        // `部首` chỉ có ĐÚNG MỘT từ loại → hàng đáp án một ô, lộ đáp án.
        expect(src).toMatch(/if \(uniqueTypes\.length < optionsCount\)/);
        expect(src).toMatch(/GameLogic\.vocabularyData/);
    });

    test('dừng bù khi đã đủ, không quét cả kho vô ích', () => {
        expect(src).toMatch(/if \(pool\.size >= optionsCount\) break;/);
    });
});

describe('từ loại GHÉP cũng dịch được', () => {
    test('tách theo "/" rồi dịch từng phần', () => {
        // 331 từ mang `名词/动词`; không xử lý là hiện chữ Hán trần giữa danh
        // sách tiếng Việt.
        expect(src).toMatch(/const labelOf = \(type\)/);
        expect(src).toMatch(/key\.includes\('\/'\)/);
        expect(src).toMatch(/\.split\('\/'\)/);
    });

    test('type lạ vẫn hiện được, không rỗng', () => {
        // Thà hiện giá trị thô còn hơn ô đáp án trống trơn.
        expect(src).toMatch(/return key;/);
    });
});
