/**
 * "Ôn lại từ sai" đọc câu hỏi bằng đúng giọng của mặt đang hiện.
 *
 * Lỗi cũ: bật đảo chiều thì trắc nghiệm / điền từ / đúng-sai hiện NGHĨA tiếng Việt nhưng
 * vẫn đọc bằng giọng tiếng Anh; nút loa còn đọc `word.en`, tức là đọc lộ đáp án.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { maCapHoc, maTheoChieu } from './nhanNgonNgu.js';

// Chạy đúng hai hàm thuần trong file chế độ, như các test khác của "Ôn lại từ sai".
const src = readFileSync(join(__dirname, 'modes', 'reviewMistakes.js'), 'utf8');
const ham = (ten) => { const i = src.indexOf(`function ${ten}(`); return src.slice(i, src.indexOf('\n}', i) + 2); };
const giongDeBai = new Function('maCapHoc', 'maTheoChieu',
    `${ham('deBai')}\n${ham('giongDeBai')}; return giongDeBai;`)(maCapHoc, maTheoChieu);

const W = { en: 'apple', vn: 'quả táo' };

beforeEach(() => { localStorage.setItem('vocabLang', 'en'); });

describe('giọng đọc câu hỏi', () => {
    test('đảo chiều: đọc nghĩa tiếng Việt bằng giọng Việt, không đọc đáp án', () => {
        for (const q of [
            { kieu: 'choice', word: W, question: 'quả táo', reversed: true },
            { kieu: 'fill', word: W, displayWord: 'quả táo', reversed: true },
            { kieu: 'truefalse', word: W, question: 'quả táo', reversed: true },
        ]) {
            expect(giongDeBai(q)).toEqual({ chu: 'quả táo', ma: 'vi-VN' });
        }
    });
    test('chiều thường: đọc từ bằng giọng Anh', () => {
        expect(giongDeBai({ kieu: 'choice', word: W, question: 'apple', reversed: false })).toEqual({ chu: 'apple', ma: 'en-US' });
        expect(giongDeBai({ kieu: 'flashcard', word: W })).toEqual({ chu: 'apple', ma: 'en-US' });
    });
    test('kiểu nghe luôn đọc từ cần học, kể cả khi đảo chiều', () => {
        expect(giongDeBai({ kieu: 'listen', word: W, question: 'quả táo', reversed: true })).toEqual({ chu: 'apple', ma: 'en-US' });
    });
    test('tự đọc và nút loa đều đi qua giongDeBai', () => {
        expect(src.match(/= giongDeBai\(question\)/g)).toHaveLength(2);
        expect(src).not.toMatch(/speakWord\(question\.word\.en, maCapHoc/);
    });
});
