/**
 * Số từ tối thiểu để mở một chế độ — KHÁC NHAU theo từng chế độ.
 *
 * Trước đây mọi chế độ đều bị chặn ở 4 từ. Nhưng con số đó chỉ đúng với các chế
 * độ TRẮC NGHIỆM: chúng cần 1 đáp án đúng + 3 nhiễu lấy từ chính bộ đang luyện.
 *
 * Áp cho cả chế độ không có đáp án nhiễu là chặn nhầm — bộ 2 từ vẫn lật thẻ
 * (flashcard), tập viết (hanzi-writing) hay nghe-gõ (dictation) bình thường.
 * Người dùng vừa tải lên một bộ nhỏ thì không mở được gì, mà thông báo lại nói
 * "cần ít nhất 4 từ" như thể đó là luật chung.
 *
 * Ngưỡng phải khớp với thứ chế độ THẬT SỰ cần, không phải con số cho tròn:
 * đặt thấp hơn mức an toàn là sập lúc chạy (vd speed-quyz cần một từ khác để
 * làm đáp án sai; 1 từ thì `randomElement` bốc trên mảng rỗng).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'practiceManager.js'), 'utf8');
const config = readFileSync(join(__dirname, '..', '..', 'game', 'config.js'), 'utf8');

/** Bảng ngưỡng đọc thẳng từ mã nguồn. */
const table = (() => {
    const m = src.match(/const MIN_WORDS_BY_MODE = \{([\s\S]*?)\n\};/);
    expect(m, 'không tìm thấy MIN_WORDS_BY_MODE').toBeTruthy();
    const out = {};
    for (const [, mode, n] of m[1].matchAll(/'([a-z-]+)':\s*(\d+)/g)) out[mode] = Number(n);
    return out;
})();

describe('chế độ KHÔNG có đáp án nhiễu chỉ cần 1 từ', () => {
    for (const mode of [
        'flashcard',        // lật thẻ xem nghĩa
        'hanzi-writing',    // tập viết chữ Hán
        'pronunciation',    // đọc theo, chấm bằng micro
        'dictation',        // nghe rồi gõ lại
        'fill-blank',       // gõ từ vào chỗ trống
        'sentence-builder', // xếp lại câu ví dụ của chính từ đó
    ]) {
        test(`${mode} → 1`, () => {
            expect(table[mode]).toBe(1);
        });
    }

    test('những chế độ này KHÔNG khai optionsCount', () => {
        // `optionsCount` chính là dấu hiệu "cần đáp án nhiễu". Chế độ nào có nó
        // mà lại đặt ngưỡng 1 là sẽ sinh thiếu lựa chọn lúc chạy.
        for (const [mode, min] of Object.entries(table)) {
            if (min > 1) continue;
            const block = config.match(new RegExp(`'${mode}':\\s*\\{[^}]*\\}`));
            if (!block) continue;
            expect(block[0], `${mode} có optionsCount mà ngưỡng chỉ 1`)
                .not.toMatch(/optionsCount/);
        }
    });
});

describe('ngưỡng riêng cho chế độ có ràng buộc nhẹ', () => {
    test('speed-quiz cần 2 — phải có một từ khác làm đáp án SAI', () => {
        // `generateSpeedQuiz` lọc `w.en !== word.en` rồi `randomElement`. Pool 1
        // từ là bốc trên mảng rỗng → undefined → sập khi đọc `.vn`.
        expect(table['speed-quiz']).toBe(2);
    });

    test('matching cần 3 — một cặp thì bấm phát trúng ngay', () => {
        expect(table['matching']).toBe(3);
    });
});

describe('mặc định vẫn là 4 cho chế độ trắc nghiệm', () => {
    test('hàm rơi về 4 khi chế độ không có trong bảng', () => {
        expect(src).toMatch(/return MIN_WORDS_BY_MODE\[mode\] \?\? 4;/);
    });

    for (const mode of ['multiple-choice', 'listening', 'synonym-check', 'word-type-check']) {
        test(`${mode} KHÔNG được nới lỏng`, () => {
            // Chúng cần 1 đúng + 3 nhiễu; nới xuống là hàng đáp án thiếu ô.
            expect(table[mode]).toBeUndefined();
        });
    }
});

describe('dùng ngưỡng động, không chốt cứng số 4', () => {
    test('điều kiện chặn đọc từ minWordsFor', () => {
        expect(src).toMatch(/const minWords = minWordsFor\(mode\);/);
        expect(src).toMatch(/if \(pool\.length < minWords\)/);
        // Bản cũ chốt cứng.
        expect(src).not.toMatch(/if \(pool\.length < 4\)/);
    });

    test('thông báo hiện ĐÚNG ngưỡng của chế độ đó', () => {
        // In cứng "4 từ" trong khi chế độ chỉ cần 1 là nói sai với người dùng.
        expect(src).toMatch(/Chế độ này cần ít nhất <strong>\$\{minWords\} từ<\/strong>/);
    });
});
