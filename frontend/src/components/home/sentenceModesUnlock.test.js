/**
 * Ba chế độ luyện CÂU phải luôn mở.
 *
 * Chúng là con đường duy nhất trong app rèn kỹ năng đặt câu — 12 chế độ còn lại
 * đều hỏi từ ĐƠN LẺ (chọn nghĩa, ghép cặp, nghe rồi chọn). Trong DB thật, cả ba
 * đều 0 phiên: hai cái bị `weekendOnly` nên người học chỉ chạm tới hai ngày mỗi
 * tuần, mà đó lại là kỹ năng cần lặp đều nhất.
 *
 * Cùng bẫy đã gỡ cho "Ôn lại từ sai": chế độ tồn tại nhưng bị khoá nên không ai
 * gặp, và nhìn vào số liệu thì tưởng tính năng không có.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const home = readFileSync(join(__dirname, 'HomeScreen.jsx'), 'utf8');
const cfg = readFileSync(join(__dirname, '..', '..', 'game', 'config.js'), 'utf8');
const srv = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'backend', 'utils', 'energyCosts.js'), 'utf8');

const CHE_DO_CAU = ['sentence-builder', 'context-learning', 'example-fill-blank'];

/** Cụm cấu hình của một chế độ trong lưới trang chủ. */
function the(mode) {
    const i = home.indexOf(`mode: '${mode}'`);
    expect(i, `không tìm thấy chế độ ${mode}`).toBeGreaterThan(-1);
    return home.slice(home.lastIndexOf('{', i), home.indexOf('},', i));
}

describe('ba chế độ luyện câu đều mở', () => {
    for (const mode of CHE_DO_CAU) {
        test(`${mode} KHÔNG khoá cuối tuần`, () => {
            expect(the(mode)).not.toContain('weekendOnly');
        });
    }

    test('cả ba đều có mặt trong lưới', () => {
        for (const mode of CHE_DO_CAU) {
            expect(home).toContain(`mode: '${mode}'`);
        }
    });
});

describe('Tốc độ VẪN khoá — khan hiếm chỉ hợp với thứ thưởng nhiều', () => {
    test('speed-quiz giữ weekendOnly', () => {
        // Không phải cứ bỏ khoá tất cả: Tốc độ là thử thách lấy điểm, không phải
        // kỹ năng cần luyện hằng ngày. Giữ nó khoá là giữ lý do để quay lại
        // cuối tuần.
        expect(the('speed-quiz')).toContain('weekendOnly');
    });
});

describe('giá năng lượng khớp ở CẢ BA nơi', () => {
    // Lệch thì thẻ hiện một giá, client trừ một giá, server trừ giá khác.
    const doc = (src, mode) => {
        const m = src.match(new RegExp(`'${mode}':\\s*(\\d+)`));
        return m ? Number(m[1]) : null;
    };

    for (const mode of CHE_DO_CAU) {
        test(mode, () => {
            const giaThe = Number((the(mode).match(/cost:\s*(\d+)/) || [])[1]);
            expect(giaThe).toBeGreaterThan(0);
            expect(doc(cfg, mode)).toBe(giaThe);
            expect(doc(srv, mode)).toBe(giaThe);
        });
    }
});

describe('không chế độ nào rơi vào màn hình trắng câm', () => {
    // `if (questions.length > 0)` mà thiếu `else` thì bộ từ không có câu ví dụ
    // sẽ cho ra màn hình trống, header vẫn chạy — nhìn y như bài đang mở.
    for (const [mode, file] of [
        ['sentence-builder', 'sentenceBuilder.js'],
        ['context-learning', 'contextLearning.js'],
        ['example-fill-blank', 'exampleFillBlank.js'],
    ]) {
        test(`${mode} báo rõ khi không có câu ví dụ`, () => {
            const src = readFileSync(
                join(__dirname, '..', 'practice', 'modes', file), 'utf8');
            expect(src).toMatch(/questions\.length === 0|questions\.length > 0/);
            expect(src).toMatch(/PracticeManager\.complete\(\)/);
            expect(src).toMatch(/Notification\.show\(/);
        });
    }
});

describe('Xếp câu tách được cả tiếng Trung', () => {
    test('chữ Hán tách theo từng ký tự, bỏ dấu câu', () => {
        // Tiếng Trung không có khoảng trắng; tách theo `split(' ')` thì cả câu
        // thành một mảnh duy nhất và không còn gì để sắp xếp.
        const src = readFileSync(
            join(__dirname, '..', 'practice', 'modes', 'sentenceBuilder.js'), 'utf8');
        const i = src.indexOf('splitIntoPhrases(sentence) {');
        const body = src.slice(i, src.indexOf('\n    },', i));

        const fn = new Function(`return {${body}}}`)().splitIntoPhrases;
        expect(fn('对不起，我迟到了。')).toEqual(['对', '不', '起', '我', '迟', '到', '了']);
        expect(fn('I am late.')).toEqual(['I', 'am', 'late']);
        // Câu dài gộp thành cụm, không phải từng từ rời.
        expect(fn('You can manage your direct deposit preferences online.').length)
            .toBeLessThan(8);
    });
});
