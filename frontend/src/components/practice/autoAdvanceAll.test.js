/**
 * Cài đặt "Tự động chuyển câu" phải ăn ở MỌI chế độ.
 *
 * Lỗi người dùng báo: tắt cài đặt rồi mà Hiểu qua câu, Xếp câu và Viết chữ Hán
 * vẫn tự chuyển. Nguyên nhân: ba chế độ này tự `setTimeout(...nextQuestion)`
 * thay vì dùng `afterAnswer` — helper chung mà 10 chế độ kia đều dùng, và là
 * chỗ DUY NHẤT đọc `settings.autoAdvance`.
 *
 * Kiểu lỗi này im lặng theo đúng nghĩa: chế độ vẫn chạy, không lỗi nào báo, chỉ
 * là một cài đặt không có tác dụng ở ba chỗ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODES_DIR = join(__dirname, 'modes');
const doc = (f) => readFileSync(join(MODES_DIR, f), 'utf8');

/**
 * Chế độ hỏi–đáp có nhịp "trả lời xong → sang câu kế".
 *
 * Ba chế độ ngoài danh sách và LÝ DO:
 *   · `speedQuiz`  — vốn là chạy đua với đồng hồ, dừng lại chờ bấm là phá luật
 *     chơi của chính nó.
 *   · `pronunciationMode` — chờ người dùng bấm mic, không có nhịp cố định.
 *   · `flashcard`/`matching` — không có khái niệm "trả lời đúng/sai từng câu".
 */
const CHE_DO = [
    'contextLearning.js', 'sentenceBuilder.js', 'hanziWriting.js',
    'multipleChoice.js', 'fillBlank.js', 'exampleFillBlank.js', 'listening.js',
    'synonymCheck.js', 'wordTypeCheck.js', 'phoneticQuiz.js',
    'reviewMistakes.js', 'sentenceListening.js', 'dictation.js',
];

describe('mọi chế độ hỏi–đáp đều dùng `afterAnswer`', () => {
    for (const f of CHE_DO) {
        test(`${f.replace('.js', '')} gọi afterAnswer`, () => {
            // Đây là chỗ DUY NHẤT đọc `settings.autoAdvance`; không gọi nó thì
            // cài đặt không có tác dụng, mà không có gì báo.
            expect(doc(f)).toMatch(/afterAnswer\(/);
        });
    }

    test('ba chế độ người dùng báo lỗi nay đều có', () => {
        // Ghi riêng để nếu ai gỡ ra thì thấy đúng ca này đỏ.
        for (const f of ['contextLearning.js', 'sentenceBuilder.js', 'hanziWriting.js']) {
            expect(doc(f)).toMatch(/afterAnswer\(this, '[\w-]+'\)/);
        }
    });
});

describe('không còn tự chuyển câu bằng setTimeout', () => {
    for (const f of ['contextLearning.js', 'sentenceBuilder.js', 'hanziWriting.js']) {
        test(`${f.replace('.js', '')} bỏ setTimeout ở luồng TRẢ LỜI`, () => {
            // `setTimeout(...nextQuestion)` bỏ qua cài đặt. Vẫn cho phép ở luồng
            // BỎ QUA / HẾT GIỜ: ở đó người dùng chủ động rời câu, và mọi chế độ
            // khác cũng tự chuyển.
            const src = doc(f);
            // Đếm số chỗ setTimeout gọi thẳng nextQuestion.
            const soCho = (src.match(/setTimeout\(\s*\(\)\s*=>\s*\{?\s*this\.nextQuestion/g) || []).length;
            // Chỉ còn tối đa MỘT (luồng bỏ qua), không phải luồng trả lời.
            expect(soCho).toBeLessThanOrEqual(1);
        });
    }
});

describe('thời gian chuyển câu chỉnh được', () => {
    const delay = readFileSync(join(__dirname, 'transitionDelay.js'), 'utf8');

    test('ba chế độ có mặt trong bảng', () => {
        // Không có trong bảng thì `getTransitionDelay` rơi về 1200ms mặc định —
        // Xếp câu đang chờ 3500ms sẽ đột ngột nhanh gấp ba.
        for (const id of ['context-learning', 'sentence-builder', 'hanzi-writing']) {
            expect(delay).toContain(`id: '${id}'`);
        }
    });

    test('GIỮ NGUYÊN thời gian cũ làm mặc định', () => {
        // Người đang quen nhịp nào thì vẫn nhịp đó; đổi luôn cả tốc độ là hai
        // thay đổi trong một lần sửa.
        expect(delay).toMatch(/id: 'context-learning'[^}]*def: 2000/);
        expect(delay).toMatch(/id: 'sentence-builder'[^}]*def: 3500/);
        expect(delay).toMatch(/id: 'hanzi-writing'[^}]*def: 1200/);
    });

    test('mọi chế độ trong bảng đều có tên tiếng Việt', () => {
        // Bảng này hiện ra ở Cài đặt; thiếu tên thì người dùng thấy mã chế độ.
        const ids = [...delay.matchAll(/id: '([\w-]+)',\s*name: '([^']+)'/g)];
        expect(ids.length).toBeGreaterThanOrEqual(12);
        for (const [, id, name] of ids) expect(name).not.toBe(id);
    });
});

describe('không bỏ sót chế độ nào', () => {
    test('mọi file chế độ hoặc dùng `afterAnswer`, hoặc nằm trong danh sách miễn', () => {
        // Chốt chặn cho chế độ THÊM SAU: quên gọi `afterAnswer` thì ca này đỏ
        // ngay, thay vì đợi người dùng phát hiện.
        const MIEN = new Set([
            'speedQuiz.js',           // chạy đua đồng hồ
            'pronunciationMode.js',   // chờ bấm mic
            'flashcard.js',           // không có đúng/sai từng câu
            'matching.js',            // nối cặp, không theo câu
            'pronunciationScoring.js',
        ]);
        const files = readdirSync(MODES_DIR)
            .filter((f) => f.endsWith('.js') && !f.includes('.test.'));

        const thieu = files.filter((f) => !MIEN.has(f) && !doc(f).includes('afterAnswer('));
        expect(thieu).toEqual([]);
    });
});
