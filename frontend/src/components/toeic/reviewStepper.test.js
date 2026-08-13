/**
 * Thanh chuyển câu ở màn xem lại bài TOEIC, và ngôn ngữ thu âm của popup Dịch.
 *
 * Ba chỗ dễ hỏng im lặng:
 *   1. `width: 680px` cố định — trên màn 360px nó tràn 320px và nút "Câu sau"
 *      nằm hẳn ngoài màn hình. Người dùng chỉ thấy "Câu trước" và tưởng câu
 *      hiện tại là câu cuối.
 *   2. Ép ba thứ (nút · nhãn · nút) vào một hàng ở màn hẹp thì nhãn ở giữa bóp
 *      hai nút — mà nút mới là thứ phải bấm.
 *   3. Popup Dịch thu âm theo ngôn ngữ ĐANG HỌC thay vì ngôn ngữ NGUỒN đã chọn,
 *      và không dựng lại phiên khi đổi nguồn (mã `lang` chỉ đọc lúc tạo).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'toeic.css'), 'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

const modal = readFileSync(
    join(__dirname, '..', 'translate', 'TranslateModal.jsx'), 'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

describe('thanh chuyển câu không bị cắt cụt', () => {
    test('KHÔNG khoá bề rộng cố định', () => {
        // 680px trên màn 360 là tràn ra ngoài, nút cuối biến mất.
        const rules = css.match(/\.review-stepper\s*\{[^}]*\}/g) || [];
        expect(rules.length).toBeGreaterThan(0);
        for (const r of rules) {
            expect(r).not.toMatch(/[^-]width:\s*\d+px/);
        }
    });

    test('có trần bề rộng nhưng co được', () => {
        expect(css).toMatch(/\.review-stepper\s*\{[^}]*max-width:\s*680px/);
        expect(css).toMatch(/\.review-stepper\s*\{[^}]*width:\s*100%/);
    });
});

describe('màn hẹp: hai nút dồn một hàng', () => {
    function mobileBlock() {
        const re = /@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/g;
        let m;
        while ((m = re.exec(css)) !== null) {
            if (m[1].includes('.review-stepper')) return m[1];
        }
        expect.fail('không tìm thấy khối 640px của .review-stepper');
    }

    test('cho xuống dòng', () => {
        expect(mobileBlock()).toMatch(/flex-wrap:\s*wrap/);
    });

    test('nhãn số câu lên HÀNG TRÊN, chiếm trọn dòng', () => {
        const b = mobileBlock();
        expect(b).toMatch(/\.review-stepper-pos\s*\{[^}]*order:\s*-1/);
        expect(b).toMatch(/\.review-stepper-pos\s*\{[^}]*flex:\s*1 0 100%/);
    });

    test('hai nút chia đều hàng dưới và CO ĐƯỢC', () => {
        // Thiếu `min-width: 0` thì nút có nhãn dài vẫn đẩy hàng vỡ.
        const b = mobileBlock();
        expect(b).toMatch(/\.review-stepper \.toeic-part-btn\s*\{[^}]*flex:\s*1 1 0/);
        expect(b).toMatch(/\.review-stepper \.toeic-part-btn\s*\{[^}]*min-width:\s*0/);
    });

    test('ẩn gợi ý phím tắt ← → — máy cảm ứng không có bàn phím', () => {
        expect(mobileBlock()).toMatch(/\.review-stepper-hint\s*\{[^}]*display:\s*none/);
    });
});

describe('popup Dịch: thu âm theo ngôn ngữ NGUỒN', () => {
    test('dùng ngôn ngữ nguồn đã chọn, không phải ngôn ngữ đang học', () => {
        expect(modal).toMatch(/speechLangForSource\(srcLang,/);
    });

    test('`auto` rơi về ngôn ngữ đang học làm dự phòng', () => {
        expect(modal).toMatch(/speechLangForSource\(srcLang, speechLangFor\(getVocabLang\(\)\)\)/);
    });

    test('đổi nguồn thì DỰNG LẠI phiên nhận dạng', () => {
        // `lang` chỉ được đọc lúc tạo phiên; giữ deps rỗng là chọn 中文 xong vẫn
        // nghe tiếng Anh.
        const i = modal.indexOf('createSpeechInput({');
        const rest = modal.slice(i);
        const deps = rest.slice(0, rest.indexOf('useEffect', 1) === -1 ? rest.length : undefined);
        expect(deps).toMatch(/\}, \[srcLang\]\);/);
    });
});
