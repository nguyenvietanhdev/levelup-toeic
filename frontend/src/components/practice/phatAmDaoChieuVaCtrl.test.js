/**
 * Hai luật quanh "đọc cái gì".
 *
 * ── 1. TỰ ĐỘNG PHÁT ÂM CHẠY Ở CẢ HAI CHIỀU ──────────────────────────────────
 * Trắc nghiệm tắt hẳn tự động phát âm khi đảo chiều (`!question.reversed`). Lý
 * do ban đầu đúng: mặt hỏi lúc ấy là NGHĨA, mà nó lại đọc `word.en` — bằng đọc
 * thẳng đáp án ra loa.
 *
 * Nhưng cách chữa đúng là đọc THỨ ĐANG HIỆN, không phải bỏ luôn tính năng. Mặt
 * hỏi khi đảo chiều là nghĩa; đọc nghĩa lên chẳng lộ gì cả, và người bật "Tự
 * động phát âm" thì chiều nào cũng muốn nghe.
 *
 * ── 2. CTRL CHỈ ĐỌC ĐÚNG MỘT KEY CHÍNH ──────────────────────────────────────
 * Ctrl là "đọc lại từ đang học". Nhưng `speakWord` ghi đè mục tiêu đó sau MỌI
 * lượt đọc, nên chỉ cần một câu ví dụ vừa tự phát là Ctrl quay sang đọc câu ví
 * dụ — bấm để nghe lại một từ mà nhận về cả một câu dài, và không còn cách nào
 * nghe lại đúng cái từ nữa.
 *
 * Chữa bằng `speakPhu`: đọc nhưng KHÔNG đổi mục tiêu. Đánh dấu ở lượt đọc PHỤ
 * chứ không phải lượt chính — chính là mặc định (43 chỗ gọi), phụ chỉ vài chỗ,
 * nên chỗ nào quên cũng chỉ rơi về hành vi cũ chứ không mất mục tiêu im lặng.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const D = join(__dirname, 'modes');
const F = (f) => readFileSync(join(D, f), 'utf8');
const gl = readFileSync(join(__dirname, '..', '..', 'game', 'gameLogic.js'), 'utf8');
const eb = readFileSync(join(__dirname, 'exampleBlock.js'), 'utf8');
const mc = F('multipleChoice.js');
const rm = F('reviewMistakes.js');
const fc = F('flashcard.js');

describe('tự động phát âm chạy ở CẢ HAI chiều', () => {
    test('Trắc nghiệm KHÔNG còn tắt khi đảo chiều', () => {
        expect(mc).not.toMatch(/if \(!question\.reversed && GameState/);
    });

    test('Trắc nghiệm gác DUY NHẤT bằng cài đặt "Tự động phát âm"', () => {
        const i = mc.indexOf('this.attachListeners();');
        const sau = mc.slice(i, i + 700);
        expect(sau).toMatch(/if \(GameState\.state\?\.settings\?\.autoPronunciation\) \{/);
    });

    test('đọc MẶT ĐANG HIỆN, không phải luôn luôn `word.en`', () => {
        // Đây là điều làm việc bỏ `!reversed` trở nên an toàn: mặt hỏi khi đảo
        // chiều là nghĩa, không phải đáp án. Đọc `word.en` mà bỏ chặn thì thành
        // đọc thẳng đáp án ra loa.
        const i = mc.indexOf('autoPronunciation) {');
        expect(mc.slice(i, i + 300))
            .toMatch(/speakWord\(question\.question \|\| question\.word\.en\)/);
    });

    test('giống hệt thứ NÚT LOA đọc', () => {
        // Bấm nút hay để nó tự đọc mà ra hai kết quả khác nhau thì người dùng
        // không hiểu nổi cái nào mới đúng.
        expect(mc).toMatch(/GameLogic\.speakWord\(q\.question \|\| q\.word\.en\)/);
    });

    test('"Ôn từ sai" cũng đọc mặt đang hiện', () => {
        // Thẻ chữ dùng `deBai(question)`; đọc `w.en` là nghe một đằng nhìn một nẻo.
        const i = rm.indexOf('autoPronunciation) {');
        expect(rm.slice(i, i + 300)).toMatch(/speakWord\(deBai\(question\) \|\| w\.en\)/);
    });

    test('Flashcard vốn đã đúng — vẫn đọc mặt trước', () => {
        expect(fc).toMatch(/this\.pronounce\(this\.chuMat\(word\)\)/);
    });
});

describe('`speakPhu` — đọc mà không cướp mục tiêu của Ctrl', () => {
    const than = (() => {
        const i = gl.indexOf('speakPhu(text, lang = null, onEnd = null) {');
        expect(i, 'không tìm thấy `speakPhu`').toBeGreaterThan(-1);
        return gl.slice(i, gl.indexOf('\n    },', i));
    })();

    test('giữ lại mục tiêu cũ rồi trả về nguyên vẹn', () => {
        expect(than).toMatch(/const giu = this\._replayCallback;/);
        expect(than).toMatch(/this\._replayCallback = giu;/);
    });

    test('khôi phục SAU khi đã gọi `speakWord`', () => {
        // Khôi phục trước thì `speakWord` ghi đè lại ngay sau đó — không được gì.
        expect(than.indexOf('this.speakWord(')).toBeLessThan(than.lastIndexOf('= giu;'));
    });

    test('vẫn chuyền đủ `lang` và `onEnd`', () => {
        // Nuốt mất `onEnd` thì nhịp chuyển câu của Trắc nghiệm đứng im.
        expect(than).toMatch(/this\.speakWord\(text, lang, onEnd\)/);
    });

    test('`replayLast` vẫn đi qua đúng mục tiêu đó', () => {
        const i = gl.indexOf('replayLast() {');
        expect(gl.slice(i, i + 120)).toMatch(/if \(this\._replayCallback\) this\._replayCallback\(\)/);
    });
});

describe('lượt đọc PHỤ đều đi qua `speakPhu`', () => {
    for (const [ten, src, mota] of [
        ['khối ví dụ dùng chung', eb, 'nút loa câu ví dụ + lượt tự đọc'],
        ['Trắc nghiệm', mc, 'nút loa và lượt tự đọc câu ví dụ'],
        ['Flashcard', fc, 'nút loa câu ví dụ / từ đồng nghĩa ở mặt sau'],
    ]) {
        test(`${ten}: ${mota}`, () => {
            expect(src).toMatch(/GameLogic\.speakPhu\(/);
        });
    }

    test('khối ví dụ KHÔNG còn lượt `speakWord` nào', () => {
        // Sót một chỗ là Ctrl vẫn bị cướp, chỉ theo đường khác.
        expect(eb).not.toMatch(/GameLogic\.speakWord\(/);
    });

    test('Flashcard: `pronounceText` là đường của nút phụ', () => {
        const i = fc.indexOf('pronounceText(text) {');
        expect(fc.slice(i, i + 300)).toMatch(/GameLogic\.speakPhu\(text\)/);
    });
});

describe('lượt đọc CHÍNH vẫn giữ nguyên `speakWord`', () => {
    test('Trắc nghiệm: đọc từ lúc hiện câu hỏi', () => {
        // Đây mới là thứ Ctrl phải đọc lại.
        const i = mc.indexOf('autoPronunciation) {');
        expect(mc.slice(i, i + 300)).toMatch(/GameLogic\.speakWord\(/);
    });

    test('"Ôn từ sai": đọc từ lúc hiện câu hỏi', () => {
        const i = rm.indexOf('autoPronunciation) {');
        expect(rm.slice(i, i + 300)).toMatch(/GameLogic\.speakWord\(/);
    });

    test('Flashcard: mặt thẻ vẫn dùng `pronounce`, không phải `pronounceText`', () => {
        // Hai hàm khác nhau và phải khác nhau: một cái là từ đang học, một cái
        // là chú thích.
        expect(fc).toMatch(/pronounce\(text\) \{|pronounce\(/);
        expect(fc.indexOf('pronounceText(text) {'))
            .not.toBe(fc.indexOf('pronounce(this.chuMat(word))'));
    });
});
