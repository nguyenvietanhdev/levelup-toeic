/**
 * Bôi đen chữ + Shift+Z = mở popup dịch với đoạn đó.
 *
 * Cái khó: phím Shift ĐÃ mang sẵn một nghĩa khác — "giữ Shift để nói" (cả ở
 * TopNav lẫn trong popup dịch). Dùng tổ hợp Shift+Z thì hai tính năng tách hẳn
 * nhau, nhưng nảy sinh một bẫy khác: nhánh `else` của handler gọi
 * `gesture.otherKeyDown()` để HUỶ cử chỉ nói khi người dùng bấm phím khác. Bấm
 * Z trong lúc giữ Shift sẽ rơi đúng vào đó — nên nhánh Shift+Z phải đặt TRƯỚC
 * và `return` ngay, không để lọt xuống.
 *
 * Bốn chỗ dễ hỏng, đều IM LẶNG:
 *   1. Không lọc ô nhập → đang soạn dở mà gõ "Z" hoa thì bị nuốt phím.
 *   2. Không chặn `e.repeat` → giữ phím một giây là popup mở hàng chục lần.
 *   3. Không xoá vùng chọn → bấm lại vẫn mở popup của từ cũ.
 *   4. Gọi thẳng `setTranslateText` → bỏ qua khoá theo Level.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'TopNav.jsx'), 'utf8');

/** Thân hàm đọc vùng chọn. */
const readSel = (() => {
    const i = src.indexOf('const readSelection = () =>');
    expect(i).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('const onKeyDown', i));
})();

describe('phím tắt là Shift+Z', () => {
    test('bắt đúng tổ hợp, chấp nhận cả z thường và Z hoa', () => {
        // Giữ Shift thì `e.key` là 'Z' hoa; nhưng CapsLock hoặc bàn phím lạ có
        // thể cho 'z' — bắt cả hai cho chắc.
        expect(src).toMatch(/e\.shiftKey && \(e\.key === 'Z' \|\| e\.key === 'z'\)/);
    });

    test('đặt TRƯỚC nhánh Shift và return ngay', () => {
        // Nhánh `else` gọi `gesture.otherKeyDown()` để huỷ cử chỉ nói khi bấm
        // phím khác. Đặt sau là bấm Z lúc giữ Shift sẽ huỷ mất cử chỉ đó.
        const zIdx = src.indexOf("e.shiftKey && (e.key === 'Z'");
        expect(zIdx).toBeGreaterThan(-1);
        // Nhánh Shift (cử chỉ nói) phải nằm SAU nhánh Shift+Z.
        expect(zIdx).toBeLessThan(src.indexOf("if (e.key === 'Shift') {", zIdx));
    });

    test('"giữ Shift để nói" vẫn nguyên vẹn', () => {
        expect(src).toMatch(/gesture\.keyDown\(\{ repeat: e\.repeat \}\)/);
        expect(src).toMatch(/if \(e\.key === 'Shift'\) gesture\.keyUp\(\)/);
    });

    test('bỏ qua lần lặp khi GIỮ phím', () => {
        // Thiếu thì giữ phím một giây là popup mở đi mở lại hàng chục lần.
        expect(src).toMatch(/if \(e\.repeat \|\| isInExam\) return;/);
    });

    test('không bôi gì thì coi như không có phím tắt', () => {
        expect(src).toMatch(/if \(!picked\) return;/);
    });
});

describe('lọc chỗ không nên tra', () => {
    test('bỏ qua vùng chọn trong ô nhập', () => {
        // Ở đó Shift+Z là gõ chữ "Z" hoa — cướp mất thì đang soạn dở bị nuốt
        // phím, mà lỗi kiểu đó rất khó đoán ra nguyên nhân.
        expect(readSel).toMatch(/input, textarea, \[contenteditable="true"\]/);
    });

    test('kiểm theo NODE của vùng chọn, không theo activeElement', () => {
        // Bôi đen bằng chuột thì tiêu điểm có thể vẫn ở chỗ khác.
        expect(readSel).toMatch(/sel\.anchorNode/);
        expect(readSel).toMatch(/nodeType === 3 \? node\.parentElement : node/);
    });

    test('bỏ qua khi đang mở popup dịch', () => {
        expect(readSel).toMatch(/#modal-container/);
    });

    test('chặn đoạn quá dài (Ctrl+A cả trang)', () => {
        // Gửi cả trang đi dịch là tốn token AI cho thứ không ai định tra.
        expect(readSel).toMatch(/raw\.length > MAX_SELECTION/);
        const max = parseInt(src.match(/const MAX_SELECTION = (\d+)/)?.[1] || '0', 10);
        expect(max).toBeGreaterThan(0);
        expect(max).toBeLessThanOrEqual(1000);
    });
});

describe('chặn khi THI, cho phép khi LUYỆN TẬP', () => {
    test('có biến riêng cho màn thi, tách khỏi isInPractice', () => {
        // `isInPractice` gộp cả luyện tập lẫn thi. Với việc tra nghĩa thì hai
        // thứ đó NGƯỢC nhau: luyện tập tra là học, thi tra là xem đáp án.
        expect(src).toMatch(/const isInExam = currentScreen === 'toeic-test-screen' \|\| toeicFullTestLock/);
    });

    test('KHÔNG chứa practice-screen — luyện từ vựng vẫn tra được', () => {
        const m = src.match(/const isInExam = [^;]+;/);
        expect(m).toBeTruthy();
        expect(m[0]).not.toMatch(/practice-screen/);
    });

    test('phím tắt kiểm isInExam, không phải isInPractice', () => {
        // Dùng nhầm `isInPractice` là tra nghĩa chết ở màn luyện tập — đúng nơi
        // cần nó nhất.
        expect(src).toMatch(/if \(e\.repeat \|\| isInExam\) return;/);
    });

    test('isInExam nằm trong deps của effect', () => {
        // Listener đóng gói giá trị của lần render này; thiếu deps thì vào/ra
        // màn thi mà handler vẫn dùng giá trị cũ.
        expect(src).toMatch(/\}, \[speechSupported, isInPractice, isInExam, startSpeech, stopSpeech\]\)/);
    });

    test('ô tìm kiếm VẪN khoá theo isInPractice như cũ', () => {
        // Chỉ nới cho phím tắt tra nghĩa, không đụng tới khoá ô tìm kiếm.
        expect(src).toMatch(/if \(isInPractice\) return;\s*\/\/ đang luyện tập thì ô tìm kiếm khoá/);
    });
});

describe('tôn trọng khoá theo Level', () => {
    test('mở popup qua openTranslateRef, không gọi thẳng setTranslateText', () => {
        const i = src.indexOf('if (!picked) return;');
        const branch = src.slice(i, i + 700);
        expect(branch).toMatch(/openTranslateRef\.current\?\.\(picked\)/);
        expect(branch).not.toMatch(/setTranslateText\(picked\)/);
    });

    test('openTranslateRef thật sự có kiểm khoá', () => {
        const i = src.indexOf('openTranslateRef.current = (text)');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 300)).toMatch(/if \(translateLock\.locked\) return warnLocked/);
    });
});

describe('dọn dẹp sau khi mở', () => {
    test('xoá vùng bôi đen', () => {
        // Giữ lại thì thả Shift ra, bấm lần nữa vẫn mở popup của từ đã tra rồi.
        expect(src).toMatch(/window\.getSelection\?\.\(\)\?\.removeAllRanges\(\)/);
    });

    test('chặn hành vi mặc định của phím', () => {
        const i = src.indexOf('if (!picked) return;');
        expect(src.slice(i, i + 500)).toMatch(/e\.preventDefault\(\)/);
    });
});

describe('người dùng biết tính năng tồn tại', () => {
    test('gợi ý trong ô tìm kiếm', () => {
        expect(src).toMatch(/bôi đen \+ Shift\+Z: tra nghĩa/);
    });
});
