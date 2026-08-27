/**
 * Gọn lại bố cục năm chế độ — cùng một loại lỗi lặp ở nhiều nơi.
 *
 * Mẫu chung: một khối chỉ chứa vài chữ nhưng mang `padding: xl` + `margin: xl`
 * + `line-height: 2`, cộng lại thành hàng trăm pixel đẩy phần TƯƠNG TÁC (nút
 * đáp án, nút Xác nhận, thanh Gợi ý/Bỏ qua) xuống dưới mép màn hình.
 *
 * Chuẩn để so: bố cục hai cột của "Đọc phiên âm" — người dùng chỉ đích danh
 * nó là kiểu trình bày đúng.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...p) => readFileSync(join(__dirname, ...p), 'utf8');
const css = F('..', '..', 'assets', 'styles', 'components.css');
const nm = F('..', '..', 'assets', 'styles', 'new-modes.css');

/** Thân rule đầu tiên khớp selector. */
const rule = (nguon, sel) => {
    const i = nguon.indexOf(sel);
    expect(i).toBeGreaterThan(-1);
    return nguon.slice(nguon.indexOf('{', i), nguon.indexOf('}', i));
};

describe('Nghe chuỗi từ: bộ đếm lên cùng hàng với khối nghe', () => {
    const src = F('modes', 'sentenceListening.js');

    test('bộ đếm nằm TRONG khối nghe', () => {
        // Trước đây là một dòng riêng chỉ để chứa năm chữ.
        const i = src.indexOf('sl-audio-area');
        const khoi = src.slice(i, src.indexOf('sl-word-grid', i));
        expect(khoi).toContain('sl-selected-count');
    });

    test('dồn sang phải, không bị bóp', () => {
        const r = rule(nm, '.sl-selected-count {');
        expect(r).toMatch(/margin-left: auto/);
        expect(r).toMatch(/flex-shrink: 0/);
    });
});

describe('Phát âm: bỏ khoảng trống kép xuống ba nút', () => {
    test('thẻ từ không còn margin dọc', () => {
        // Khối nằm trong hàng flex có `gap` riêng — margin dọc là cộng lần hai.
        expect(rule(css, '.pronunciation-word-display {')).toMatch(/margin: 0/);
    });

    test('container không tự thêm padding', () => {
        const src = F('modes', 'pronunciationMode.js');
        expect(src).toMatch(/pronunciation-container[^>]*padding:0/);
    });
});

describe('Chép chính tả: kết quả nằm trong cột trả lời', () => {
    const src = F('modes', 'dictation.js');

    test('kết quả TRONG cột phải, không tràn hết ngang', () => {
        // Mắt vừa nhìn ô nhập không phải nhảy xuống tận đáy để đọc đúng/sai.
        const i = src.indexOf('dictation-col-answer');
        const cot = src.slice(i, src.indexOf('</div>\n\n                </div>', i));
        expect(cot).toContain('dictation-result');
    });

    test('hai cột căn TRÊN, không căn giữa', () => {
        // Hiện kết quả thì cột phải cao hơn hẳn; căn giữa làm cả hai trôi lệch.
        expect(rule(nm, '.dictation-two-col {')).toMatch(/align-items: start/);
    });
});

describe('Điền vào câu: khối câu và nút đáp án gọn lại', () => {
    test('giãn dòng hợp với câu MỘT dòng', () => {
        // `line-height: 2` là của văn bản dài nhiều đoạn.
        const r = rule(css, '.sentence-with-blank {');
        expect(r).not.toMatch(/line-height: 2;/);
        expect(r).toMatch(/line-height: 1\.6/);
    });

    test('không còn `xl` chồng `xl`', () => {
        const r = rule(css, '.sentence-with-blank {');
        expect(r).not.toMatch(/margin: var\(--spacing-xl\)/);
        expect(r).not.toMatch(/padding: var\(--spacing-xl\)/);
    });

    test('nút đáp án bớt cao', () => {
        expect(rule(css, '.option-btn {')).toMatch(/padding: var\(--spacing-md\)/);
    });
});

describe('Đọc phiên âm: câu hỏi gộp vào khối phiên âm', () => {
    const src = F('modes', 'phoneticQuiz.js');

    test('câu hỏi nằm TRONG khối kích thích', () => {
        // Nó đọc liền một mạch với phiên âm ở trên ("phiên âm này — của từ
        // nào?"), tách ra là tốn nguyên một dòng cho một câu.
        const i = src.indexOf('pq-ipa-display');
        const khoi = src.slice(i, src.indexOf('pq-options', i));
        expect(khoi).toContain('pq-instruction');
    });

    test('chiếm trọn hàng dưới, không chen cạnh phiên âm', () => {
        expect(rule(nm, '.pq-instruction {')).toMatch(/flex-basis: 100%/);
        expect(rule(nm, '.pq-ipa-display {')).toMatch(/flex-wrap: wrap/);
    });
});

describe('lề thẳng với header', () => {
    test('không bó `max-width: 800px` giữa màn', () => {
        // Header trải hết bề ngang; nội dung bó 800px thì hai mép lệch nhau
        // nhìn như hai khối rời. Khung ngoài đã giới hạn 1200px rồi.
        expect(rule(css, '.example-fill-blank-container {')).not.toMatch(/max-width: 800px/);
        expect(rule(css, '.pronunciation-container {')).not.toMatch(/max-width: 800px/);
    });
});
