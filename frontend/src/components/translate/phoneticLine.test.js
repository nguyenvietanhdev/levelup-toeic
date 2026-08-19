/**
 * Dòng phiên âm trong popup Dịch nhanh, và nút dịch cả câu ở màn luyện tập.
 *
 * Google trả HAI phiên âm ở hai vị trí khác nhau trong mỗi đoạn kết quả:
 *   seg[3] = phiên âm câu GỐC   — dịch 你好 → vi cho "Nǐ hǎo"
 *   seg[2] = phiên âm BẢN DỊCH  — dịch hello → zh cho "Nǐ hǎo"
 * Trước đây chỉ lấy seg[3], nên dịch SANG tiếng Trung không có pinyin — đúng
 * chiều người học cần nhất khi tra từ mới.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const modal = readFileSync(join(__dirname, 'TranslateModal.jsx'), 'utf8');
const mc = readFileSync(
    join(__dirname, '..', 'practice', 'modes', 'multipleChoice.js'), 'utf8');
const nav = readFileSync(join(__dirname, '..', '..', 'layouts', 'TopNav.jsx'), 'utf8');
const bus = readFileSync(join(__dirname, '..', '..', 'game', 'eventBus.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('lấy CẢ HAI phiên âm', () => {
    test('phiên âm câu gốc từ seg[3]', () => {
        expect(modal).toMatch(/const phonetic = .*seg\[3\]/);
    });

    test('phiên âm BẢN DỊCH từ seg[2]', () => {
        // Thiếu cái này thì dịch sang tiếng Trung không có pinyin.
        expect(modal).toMatch(/const phoneticOut = .*seg\[2\]/);
    });

    test('cả hai vào `result`', () => {
        expect(modal).toMatch(/setResult\(\{[^}]*phonetic,[^}]*phoneticOut[^}]*\}\)/);
    });

    test('URL xin romanization', () => {
        // `dt=t` chỉ trả bản dịch; thiếu `dt=rm` là không có phiên âm nào.
        // Khớp trên DÒNG dựng URL, không phải cả file: chữ `dt=rm` còn nằm
        // trong chú thích, nên khớp cả file thì gỡ khỏi URL vẫn xanh.
        const url = modal.split('\n').find((l) => l.includes('translate_a/single'));
        expect(url).toBeTruthy();
        expect(url).toContain('dt=rm');
    });
});

describe('hiển thị', () => {
    test('dòng riêng dưới ô GỐC', () => {
        expect(modal).toMatch(/result\?\.phonetic && \(/);
        expect(modal).toMatch(/className="translate-phonetic">\{result\.phonetic\}/);
    });

    test('dòng riêng dưới ô DỊCH', () => {
        expect(modal).toMatch(/result\?\.phoneticOut && \(/);
        expect(modal).toMatch(/\{result\.phoneticOut\}/);
    });

    test('tự ẩn khi rỗng — dịch sang tiếng Việt không có phiên âm', () => {
        // Điều kiện `&&` trên chuỗi rỗng cho `false` → React không render gì.
        // Nếu đổi sang render vô điều kiện thì có một dòng trống thừa.
        expect(modal).not.toMatch(/className="translate-phonetic">\{result\?\.phonetic \|\|/);
    });

    test('có CSS, nhạt hơn chữ chính', () => {
        const i = css.indexOf('.translate-phonetic {');
        expect(i).toBeGreaterThan(-1);
        const body = css.slice(i, css.indexOf('}', i));
        expect(body).toMatch(/color:\s*var\(--text-secondary/);
        expect(body).toMatch(/font-style:\s*italic/);
    });

    test('câu dài không tràn ra ngoài popup', () => {
        const i = css.indexOf('.translate-phonetic {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/word-break/);
    });
});

describe('nút dịch cả câu ở màn luyện tập', () => {
    test('có nút, đứng TRƯỚC nút loa', () => {
        // Đọc hiểu rồi mới nghe là thứ tự tự nhiên hơn.
        const iTr = mc.indexOf('id="translate-example-btn"');
        const iLoa = mc.indexOf('id="speak-example-btn"');
        expect(iTr).toBeGreaterThan(-1);
        expect(iTr).toBeLessThan(iLoa);
    });

    test('chế độ ĐẢO CHIỀU cũng có nút, cũng đứng trước', () => {
        const i = mc.indexOf("trBtn.id = 'translate-example-btn'");
        expect(i).toBeGreaterThan(-1);
        const body = mc.slice(i, i + 600);
        expect(body.indexOf('appendChild(trBtn)')).toBeLessThan(body.indexOf('appendChild(btn)'));
    });

    test('phát sự kiện thay vì gọi thẳng React', () => {
        // Chế độ luyện tập dựng HTML thuần, không gọi được `setTranslateText`.
        expect(bus).toMatch(/TRANSLATE_REQUESTED:/);
        expect(mc).toMatch(/EventBus\.emit\(GameEvents\.TRANSLATE_REQUESTED/);
    });

    test('gửi câu ví dụ của câu hỏi ĐANG hiện', () => {
        // Đóng biến câu cũ thì bấm ở câu sau lại dịch câu trước.
        const i = mc.indexOf("getElementById('translate-example-btn')");
        expect(i).toBeGreaterThan(-1);
        const body = mc.slice(i, i + 400);
        expect(body).toMatch(/this\.questions\[this\.currentIndex\]/);
    });
});

describe('TopNav mở hộ, và tôn trọng khoá', () => {
    test('có lắng nghe sự kiện', () => {
        expect(nav).toMatch(/GameEvents\.TRANSLATE_REQUESTED/);
    });

    test('đi qua openTranslateRef — giữ khoá theo Level', () => {
        // Gọi thẳng `setTranslateText` là bỏ qua kiểm tra Level của Dịch nhanh.
        const i = nav.indexOf('GameEvents.TRANSLATE_REQUESTED');
        expect(nav.slice(i, i + 500)).toMatch(/openTranslateRef\.current\?\.\(t\)/);
    });

    test('chặn khi đang THI, KHÔNG chặn lúc luyện tập', () => {
        // Tra nghĩa giữa bài luyện là HỌC; giữa bài thi thì tra là xem đáp án.
        const i = nav.indexOf('GameEvents.TRANSLATE_REQUESTED');
        const body = nav.slice(i, i + 500);
        expect(body).toMatch(/if \(isInExam\) return;/);
        expect(body).not.toMatch(/isInPractice/);
    });

    test('bỏ qua chuỗi rỗng', () => {
        const i = nav.indexOf('GameEvents.TRANSLATE_REQUESTED');
        expect(nav.slice(i, i + 500)).toMatch(/if \(t\)/);
    });
});
