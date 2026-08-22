/**
 * Xếp câu và Tốc độ phải vừa khung hình, không phải cuộn.
 *
 * Ở Xếp câu, nút "Kiểm tra" bị tụt xuống dưới mép: nút cụm từ cao 54px, khung
 * kho từ đệm 24px mỗi phía, rồi hàng nút cách thêm 24px nữa.
 *
 * Ở Tốc độ nặng hơn, vì chế độ này TÍNH ĐIỂM THEO TỐC ĐỘ bấm — đồng hồ 72px và
 * nút Đúng/Sai đệm 32px đẩy chính hai nút đó xuống khỏi màn, nên người chơi mất
 * giây để cuộn tìm đúng thứ họ phải bấm nhanh.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
const sb = readFileSync(join(__dirname, 'modes', 'sentenceBuilder.js'), 'utf8');

/** Thân một luật CSS. Ném nếu selector xuất hiện nhiều lần — trùng luật là bug. */
function luat(selector) {
    // Cờ `m` truyền qua tham số thứ hai — JS không có cú pháp `(?m)` inline.
    const mau = `^${selector.replace('.', '\\.')}\\s*\\{`;
    const hits = [...css.matchAll(new RegExp(mau, 'gm'))];
    expect(hits.length, `${selector} khai ${hits.length} lần`).toBe(1);
    const i = hits[0].index;
    return css.slice(i, css.indexOf('}', i));
}

/** Số px của một thuộc tính; `var(--spacing-*)` quy về giá trị thật. */
function px(body, prop) {
    const m = body.match(new RegExp(`${prop}:\\s*([^;]+);`));
    if (!m) return null;
    const v = m[1].trim();
    const bang = { 'var(--spacing-sm)': 8, 'var(--spacing-md)': 16,
                   'var(--spacing-lg)': 24, 'var(--spacing-xl)': 32 };
    if (bang[v] != null) return bang[v];
    const n = v.match(/^(\d+)px/);
    return n ? Number(n[1]) : null;
}

describe('Xếp câu — nút Kiểm tra không tụt khỏi màn', () => {
    test('nút cụm từ nhỏ lại', () => {
        const body = luat('.phrase-btn');
        // Cũ: padding 16/32 → cao 54px. Ba nút một hàng đủ đẩy mọi thứ xuống.
        expect(px(body, 'padding')).toBeLessThan(16);
        expect(px(body, 'min-width')).toBeLessThan(120);
    });

    test('nút vẫn đủ lớn để chạm', () => {
        // Nén quá tay thì đổi lỗi cuộn lấy lỗi bấm trượt.
        const body = luat('.phrase-btn');
        const dem = px(body, 'padding');
        expect(dem).toBeGreaterThanOrEqual(8);
        // padding trên+dưới + chữ ≈ chiều cao nút
        expect(dem * 2 + 22).toBeGreaterThanOrEqual(38);
    });

    test('khung kho từ bớt đệm', () => {
        expect(px(luat('.words-pool-container'), 'padding')).toBeLessThan(24);
    });

    test('hàng nút sát ngay dưới kho từ', () => {
        // Chọn cụm → bấm Kiểm tra là hai bước liền nhau của một thao tác.
        const body = luat('.sentence-actions');
        expect(px(body, 'margin-top')).toBeLessThanOrEqual(16);
        expect(px(body, 'margin-bottom')).toBeLessThanOrEqual(16);
    });
});

describe('Xếp câu — Enter để kiểm tra', () => {
    test('có gắn phím Enter', () => {
        expect(sb).toMatch(/e\.key !== 'Enter'/);
        expect(sb).toMatch(/document\.addEventListener\('keydown', this\._onKey\)/);
    });

    test('gắn MỘT lần, không phải mỗi câu', () => {
        // `attachListeners` chạy lại sau mỗi `showQuestion`; gắn ở đó thì sau 10
        // câu có 10 listener và một phím Enter gọi `checkAnswer` 10 lần.
        expect(sb).toMatch(/if \(!this\._onKey\) \{/);
    });

    test('bỏ qua khi con trỏ trong ô nhập', () => {
        // Ô tìm ở nav vẫn dùng Enter để dịch.
        const i = sb.indexOf("e.key !== 'Enter'");
        const body = sb.slice(i, i + 700);
        expect(body).toMatch(/tag === 'INPUT' \|\| tag === 'TEXTAREA'/);
    });

    test('im khi nút đang disabled', () => {
        // Chưa xếp cụm nào, hoặc đã kiểm tra rồi — Enter phải im như cú bấm chuột.
        const i = sb.indexOf("e.key !== 'Enter'");
        expect(sb.slice(i, i + 700)).toMatch(/if \(!btn \|\| btn\.disabled\) return/);
    });

    test('GỠ listener khi rời chế độ', () => {
        // Không gỡ thì Enter ở màn khác vẫn gọi `checkAnswer` của bài đã đóng.
        const i = sb.indexOf('cleanup() {');
        const body = sb.slice(i, sb.indexOf('\n    }', i));
        expect(body).toMatch(/removeEventListener\('keydown', this\._onKey\)/);
        expect(body).toMatch(/this\._onKey = null/);
    });
});

describe('Tốc độ — hai nút Đúng/Sai phải nằm trong khung hình', () => {
    test('đồng hồ đếm ngược nhỏ lại', () => {
        // 72px là cỡ của một màn hình chào, không phải một chỉ số phụ trong bài.
        const body = luat('.countdown-timer');
        const co = px(body, 'font-size');
        expect(co).toBeLessThan(72);
        expect(co).toBeGreaterThanOrEqual(36);   // vẫn liếc là thấy
    });

    test('đồng hồ bớt khoảng cách dưới', () => {
        expect(px(luat('.countdown-timer'), 'margin-bottom')).toBeLessThan(32);
    });

    test('nút Đúng/Sai bớt đệm nhưng vẫn to', () => {
        const dem = px(luat('.speed-choice-btn'), 'padding');
        expect(dem).toBeLessThan(32);
        // Chế độ này bấm nhanh liên tục — nút nhỏ là bấm trượt.
        expect(dem * 2 + 22).toBeGreaterThanOrEqual(60);
    });
});

describe('CẢ THANH BA NÚT phải nằm trong khung hình', () => {
    // Tiêu chí thật của "gọn": Gợi ý / Dừng thời gian / Bỏ qua đều thấy được mà
    // không cuộn. Thanh này nằm NGOÀI markup của từng chế độ (PracticeScreen.jsx)
    // nên dễ bị bỏ quên khi đo — mà nó luôn là thứ bị đẩy xuống dưới mép.
    //
    // Số đo đọc từ CSS thật, không chép tay: sửa CSS mà quên sửa test thì bắt được.
    const MAN_THAP_NHAT = 589;   // khổ trong ảnh người dùng gửi
    const CHO = MAN_THAP_NHAT - 96 - 24;   // trừ nav dưới và đệm

    const cao = (sel, prop) => px(luat(sel), prop) ?? 0;

    /** Chiều cao khung ngoài: header + vùng nội dung + thanh ba nút. */
    function tongCaMan(noiDung) {
        const header = 16 * 2 + 40 + 16;                     // padding + nội dung + margin
        const dem = cao('.practice-content', 'padding');
        const san = cao('.practice-content', 'min-height');
        const vung = dem * 2 + Math.max(noiDung, san) + 16;  // + margin-bottom
        const toolbar = cao('.action-btn', 'padding') * 2 + 22;
        return header + vung + toolbar;
    }

    test('sàn của vùng nội dung không ép cao vô cớ', () => {
        // 280px cũ là SÀN CỨNG: nội dung gọn tới đâu khối này vẫn cao 280px,
        // cộng đệm và margin thành 328px — đủ đẩy thanh ba nút xuống dưới mép.
        expect(cao('.practice-content', 'min-height')).toBeLessThan(280);
    });

    test('Xếp câu — cả thanh ba nút vừa màn 589px', () => {
        const tieuDe = 44 + cao('.sb-prompt', 'margin-bottom') + 36;
        const oTha = cao('.sentence-area', 'margin') * 2
            + cao('.sentence-area', 'min-height');
        const nutCum = cao('.phrase-btn', 'padding') * 2 + 22;
        const kho = cao('.words-pool-container', 'padding') * 2 + nutCum;
        const hangNut = cao('.sentence-actions', 'margin-top') + 44
            + cao('.sentence-actions', 'margin-bottom');

        expect(tongCaMan(tieuDe + oTha + kho + hangNut)).toBeLessThanOrEqual(CHO);
    });

    test('Tốc độ — cả thanh ba nút vừa màn 589px', () => {
        const dongHo = cao('.countdown-timer', 'font-size')
            + cao('.countdown-timer', 'margin-bottom');
        const khoiHoi = cao('.speed-question', 'padding') * 2 + 90
            + cao('.speed-question', 'margin-bottom');
        const nut = cao('.speed-choice-btn', 'padding') * 2 + 22;

        expect(tongCaMan(dongHo + khoiHoi + 30 + nut)).toBeLessThanOrEqual(CHO);
    });
});
