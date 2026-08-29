/**
 * Flashcard: lật thẻ thì NGẮT tiếng cũ rồi đọc mặt vừa lật ra, và hai mặt
 * trình bày giống nhau (căn giữa).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'modes', 'flashcard.js'), 'utf8');
const logic = readFileSync(
    join(__dirname, '..', '..', 'game', 'gameLogic.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Thân hàm `flipCard`, tính tới hàm kế tiếp. */
const thanFlip = () => {
    const i = src.indexOf('flipCard() {');
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf('\n    },', i);
    expect(j).toBeGreaterThan(i);
    return src.slice(i, j);
};

/** Thân rule CSS đầu tiên khớp selector.
 *
 * Chuẩn hoá xuống dòng trước khi tìm: file CSS dùng CRLF nên selector
 * nhiều dòng viết trong test sẽ không bao giờ khớp. */
const cssLf = css.split(String.fromCharCode(13)).join('');
const rule = (sel) => {
    const i = cssLf.indexOf(sel);
    expect(i).toBeGreaterThan(-1);
    return cssLf.slice(cssLf.indexOf('{', i), cssLf.indexOf('}', i));
};

describe('ngắt tiếng đang phát khi lật', () => {
    test('`stopSpeaking` tồn tại và dọn cả hai đường phát tiếng', () => {
        const i = logic.indexOf('stopSpeaking()');
        expect(i).toBeGreaterThan(-1);
        const t = logic.slice(i, i + 500);
        // Audio của /api/tts...
        expect(t).toMatch(/_gttsAudio/);
        expect(t).toMatch(/\.pause\(\)/);
        // ...và giọng trình duyệt, khi /api/tts hỏng và code rơi về nó.
        expect(t).toMatch(/speechSynthesis\?\.cancel\(\)/);
    });

    test('`stopSpeaking` bỏ luôn lượt fetch đang bay', () => {
        // Chỉ `pause()` là chưa đủ: tiếng của mặt cũ có thể còn đang tải, tải
        // xong nó vẫn tự phát đè lên mặt mới.
        const i = logic.indexOf('stopSpeaking()');
        expect(logic.slice(i, i + 200)).toMatch(/_gttsSpeak/);
    });

    test('`flipCard` gọi `stopSpeaking` TRƯỚC khi đọc mặt mới', () => {
        const t = thanFlip();
        const iNgat = t.indexOf('stopSpeaking()');
        const iDoc = t.indexOf('this.pronounce(');
        expect(iNgat).toBeGreaterThan(-1);
        expect(iDoc).toBeGreaterThan(iNgat);
    });
});

describe('đọc mặt vừa lật ra, ở CẢ HAI chiều', () => {
    test('chỉ có MỘT lời gọi đọc, dùng `this.isFlipped`', () => {
        // Đọc cứng `true` là chỉ nói khi lật sang mặt sau; lật về mặt trước im
        // lặng, hai chiều hai hành vi.
        const t = thanFlip();
        const goi = t.match(/this\.pronounce\(this\.chuMat\([^)]*\)\)/g) || [];
        expect(goi).toHaveLength(1);
        expect(goi[0]).toMatch(/this\.isFlipped/);
    });

    test('nhánh `if (this.isFlipped)` không còn ôm lời gọi đọc', () => {
        const t = thanFlip();
        const i = t.indexOf('if (this.isFlipped) {');
        expect(i).toBeGreaterThan(-1);
        expect(t.slice(i)).not.toMatch(/this\.pronounce\(/);
    });

    test('bỏ đọc nếu người dùng đã sang thẻ khác trong lúc chờ', () => {
        // Có 350ms chờ hiệu ứng lật; bấm "Biết" ngay là thẻ đã đổi mà tiếng
        // của thẻ cũ mới bắt đầu.
        const t = thanFlip();
        expect(t).toMatch(/this\.words\[this\.currentIndex\] !== currentWord\) return/);
    });
});

describe('bố cục hai mặt', () => {
    test('từ chính căn TRÁI ở cả hai mặt', () => {
        // `.card-word` là mặt trước, `.card-meaning` là mặt sau — cùng một
        // rule nên hai mặt không thể lệch nhau.
        const r = rule(['.card-word,', '.card-meaning {'].join(String.fromCharCode(10)));
        expect(r).toMatch(/text-align: left/);
    });

    test('hàng phiên âm + loại từ bám trái theo từ chính', () => {
        const r = rule('.card-meta-row {');
        expect(r).toMatch(/justify-content: flex-start/);
        expect(r).not.toMatch(/justify-content: center/);
    });

    test('khối ví dụ + đồng nghĩa GIỮ căn trái', () => {
        // Người dùng chốt là khối này đang đẹp; đừng đổi sang căn giữa.
        const r = rule('.card-extras {');
        expect(r).toMatch(/text-align: left/);
    });

    test('bố cục CÓ ẢNH chỉ gắn khi thẻ thật sự có ảnh', () => {
        // `--split` đổi sang xếp ngang; gắn vô điều kiện thì thẻ không ảnh
        // cũng nhận bố cục hai cột.
        expect(src).toMatch(/card-content\$\{word\.image \? ' card-content--split' : ''\}/);
    });

    test('thẻ cao tối thiểu 320px', () => {
        const r = rule(String.fromCharCode(10) + '.flashcard {');
        expect(r).toMatch(/min-height: 320px/);
    });
});
