/**
 * Thanh luyện tập trên MÀN HẸP: nút đổi cặp xuống hẳn một hàng riêng.
 *
 * Ba chỗ hỏng, tất cả chỉ thấy trên điện thoại:
 *
 *   1. Nút có xuống dòng hay không là TÌNH CỜ. Header là flex `wrap`, nên nó
 *      phụ thuộc tên chế độ dài bao nhiêu — "Trắc nghiệm" thì rớt xuống, tên
 *      ngắn hơn thì chen vào hàng tiêu đề.
 *
 *   2. Danh sách mở ra bị KHUẤT. `.lang-pair-menu` neo `right: 0`, đúng khi nút
 *      nằm sát mép phải thanh; nút ở mép trái thì menu trải 160px sang trái và
 *      tràn khỏi màn hình — thấy một mẩu, bấm không tới.
 *
 *   3. Nhãn chữ bị ẩn, thay bằng glyph `\f362` không có trong bộ Font Awesome
 *      đang nạp → nút hiện ra một Ô VUÔNG RỖNG, không nói lên điều gì.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssGoc = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8')
    .replace(/\r/g, '');
/** Bản có comment — dùng cho hầu hết assertion. */
const css = cssGoc;
const screen = readFileSync(join(__dirname, 'PracticeScreen.jsx'), 'utf8');

/** Thân khối `@media (max-width: 560px)` chứa các luật của nút đổi cặp. */
const khoiMobile = (() => {
    const i = css.indexOf('@media (max-width: 560px) {\n  /* `wrap` phải khai');
    expect(i, 'không tìm thấy khối mobile của nút đổi cặp').toBeGreaterThan(-1);
    // Cắt tới hết khối: đếm ngoặc để không dừng ở dấu `}` của luật con.
    let sau = 0;
    for (let k = css.indexOf('{', i); k < css.length; k++) {
        if (css[k] === '{') sau++;
        else if (css[k] === '}' && --sau === 0) return css.slice(i, k + 1);
    }
    throw new Error('khối không đóng');
})();

/** Thân quy tắc đầu tiên khớp selector, trong một đoạn CSS. */
const rule = (doan, sel) => {
    const i = doan.indexOf(sel);
    expect(i, `không tìm thấy ${sel}`).toBeGreaterThan(-1);
    return doan.slice(doan.indexOf('{', i), doan.indexOf('}', i));
};

describe('ép xuống dòng, không để tình cờ', () => {
    test('có phần tử ngắt dòng trong header', () => {
        expect(screen).toMatch(/className="practice-header-break"/);
    });

    test('nó nằm NGAY TRƯỚC nút đổi cặp', () => {
        // Đặt sau thì nút vẫn ở hàng trên, chỉ có tim và đồng hồ rớt xuống.
        const iBreak = screen.indexOf('practice-header-break');
        const iSwitch = screen.indexOf('<LangPairSwitch />');
        expect(iBreak).toBeGreaterThan(-1);
        expect(iBreak).toBeLessThan(iSwitch);
    });

    test('ẩn ở màn rộng', () => {
        // Không ẩn thì màn to cũng bị xé đôi header.
        expect(rule(css, '.practice-header-break {')).toMatch(/display:\s*none/);
    });

    test('màn hẹp: chiếm trọn bề rộng, cao 0', () => {
        const r = rule(khoiMobile, '.practice-header-break {');
        expect(r).toMatch(/flex-basis:\s*100%/);
        expect(r).toMatch(/height:\s*0/);
    });

    test('khai `flex-wrap` NGAY trong khối này', () => {
        // Luật `wrap` của header nằm ở `@media 480px` bên responsive.css. Mượn
        // nó thì dải 481–560px không có wrap, mà flex `nowrap` co phần tử ngắt
        // dòng về 0 — không ngắt được gì, nút lại chen vào hàng tiêu đề.
        expect(rule(khoiMobile, '.practice-header { ')).toMatch(/flex-wrap:\s*wrap/);
    });
});

describe('nút sát trái, đồng hồ sát phải', () => {
    test('`margin-right: auto` đẩy phần còn lại sang phải', () => {
        expect(rule(khoiMobile, '.lang-pair-switch {')).toMatch(/margin-right:\s*auto/);
    });

    test('đồng hồ là phần tử CUỐI trong header', () => {
        // `margin-right: auto` chỉ đẩy được những gì đứng SAU nút; đồng hồ nằm
        // trước nó thì không bao giờ sát mép phải.
        const iSwitch = screen.indexOf('<LangPairSwitch />');
        const iTimer = screen.indexOf('practice-timer');
        expect(iTimer).toBeGreaterThan(iSwitch);
    });
});

describe('danh sách mở ra phải bấm tới được', () => {
    test('màn hẹp neo MÉP TRÁI, không phải mép phải', () => {
        const r = rule(khoiMobile, '.lang-pair-menu {');
        expect(r).toMatch(/left:\s*0/);
        expect(r).toMatch(/right:\s*auto/);
    });

    test('màn rộng VẪN neo mép phải', () => {
        // Ở đó nút nằm sát mép phải thanh; đổi sang trái là menu tràn ra ngoài
        // vùng chơi.
        expect(rule(css, '.lang-pair-menu {')).toMatch(/right:\s*0/);
    });

    test('có trần bề rộng để không tràn mép phải', () => {
        expect(rule(khoiMobile, '.lang-pair-menu {')).toMatch(/max-width:\s*calc\(100vw/);
    });
});

describe('nhãn chữ thay cho glyph hỏng', () => {
    test('màn hẹp HIỆN lại nhãn', () => {
        expect(rule(khoiMobile, '.lang-pair-label {')).toMatch(/display:\s*inline/);
    });

    test('KHÔNG còn glyph Font Awesome giả lập', () => {
        // `\f362` không có trong bộ Free đang nạp → hiện ra ô vuông rỗng.
        //
        // Bỏ COMMENT trước khi soi: chính lời giải thích trong CSS cũng nhắc mã
        // glyph đó, nên soi cả file thì test không bao giờ xanh được.
        const css = cssGoc.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(css).not.toMatch(/\.lang-pair-btn::before/);
        expect(css).not.toContain('\\f362');
    });

    test('không còn ẩn nhãn ở bất cứ đâu', () => {
        expect(css).not.toMatch(/\.lang-pair-label\s*\{\s*display:\s*none/);
    });
});
