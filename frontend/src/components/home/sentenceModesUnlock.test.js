/**
 * KHÔNG chế độ nào bị khoá theo NGÀY TRONG TUẦN.
 *
 * App từng khoá vài chế độ vào Thứ 7 & Chủ nhật (`weekendOnly`) để tạo cảm giác
 * khan hiếm. Trong DB thật thì kết quả ngược lại: những chế độ đó 0 phiên. Khoá
 * năm ngày một tuần không làm người học chờ tới cuối tuần — nó làm họ quên chế
 * độ đó tồn tại, và nhìn vào số liệu thì tưởng tính năng hỏng.
 *
 * Ba chế độ luyện CÂU chịu nặng nhất: chúng là con đường duy nhất trong app rèn
 * kỹ năng đặt câu (12 chế độ còn lại đều hỏi từ ĐƠN LẺ), mà đó lại là kỹ năng
 * cần lặp đều nhất.
 *
 * Khoá theo giờ vẫn còn, nhưng do ADMIN đặt trong tab "Khung giờ chạy chế độ" —
 * dữ liệu, tắt được, mặc định không giới hạn. Khác hẳn một luật ghi cứng trong
 * mã mà người dùng không gỡ được.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const home = readFileSync(join(__dirname, 'HomeScreen.jsx'), 'utf8');
const cfg = readFileSync(join(__dirname, '..', '..', 'game', 'config.js'), 'utf8');
const srv = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'backend', 'utils', 'energyCosts.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

const CHE_DO_CAU = ['sentence-builder', 'context-learning', 'example-fill-blank'];

/** Cụm cấu hình của một chế độ trong lưới trang chủ. */
function the(mode) {
    const i = home.indexOf(`mode: '${mode}'`);
    expect(i, `không tìm thấy chế độ ${mode}`).toBeGreaterThan(-1);
    return home.slice(home.lastIndexOf('{', i), home.indexOf('},', i));
}

describe('ba chế độ luyện câu đều mở', () => {
    test('cả ba đều có mặt trong lưới', () => {
        for (const mode of CHE_DO_CAU) {
            expect(home).toContain(`mode: '${mode}'`);
        }
    });
});

describe('khoá theo ngày trong tuần đã gỡ HẲN', () => {
    test('KHÔNG chế độ nào còn cờ `weekendOnly`', () => {
        // Chốt cả lưới, không riêng vài chế độ: gắn lại cờ cho một chế độ mới
        // là lỗi này quay lại y hệt, chỉ ở chỗ khác.
        expect(home).not.toMatch(/weekendOnly/);
    });

    test('Tốc độ mở MỌI ngày', () => {
        // Đây là chế độ cuối cùng còn giữ cờ đó.
        expect(the('speed-quiz')).not.toContain('weekendOnly');
    });

    test('không còn hàm nhận biết cuối tuần', () => {
        // Cờ đi mà hàm ở lại thì lần sau có người nối lại chỉ bằng một dòng.
        expect(home).not.toMatch(/isWeekend|getTimeUntilWeekend|weekendTimer/);
    });

    test('không còn huy hiệu đếm ngược tới cuối tuần', () => {
        expect(home).not.toMatch(/mode-weekend-badge|mode-weekend-countdown/);
        expect(css).not.toMatch(/\.mode-weekend-/);
    });

    test('lưới chế độ KHÔNG soi thứ trong tuần nữa', () => {
        // `getDay()` còn dùng cho lịch học và nhiệm vụ tuần — hai chỗ đó đọc
        // ngày để HIỂN THỊ, không để khoá. Chốt riêng đường khoá thay vì cấm
        // cả `getDay`.
        const i = home.indexOf('const locked = guestLocked');
        expect(i).toBeGreaterThan(-1);
        expect(home.slice(i, home.indexOf(';', i))).not.toMatch(/weekend/i);
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
