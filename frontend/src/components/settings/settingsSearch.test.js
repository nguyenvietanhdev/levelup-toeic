/**
 * Ô tìm ở màn Cài đặt — không được "giật" và không được để trình duyệt tự điền.
 *
 * Ba nguyên nhân chồng lên nhau gây ra hiện tượng người dùng gặp:
 *
 *   1. Nút xoá được gắn/gỡ khỏi DOM (`{navQuery && <button/>}`). Ô nhập là
 *      `flex: 1` nên mỗi lần nút xuất hiện/biến mất thì ô GIÃN RA rồi CO LẠI —
 *      thấy rõ lúc gõ ký tự đầu và lúc vừa xoá xong.
 *
 *   2. `type="search"` sinh thêm nút × RIÊNG của trình duyệt, nằm ngay cạnh nút
 *      × của app. Bấm cái này thì cái kia biến mất → nhìn như lỗi giao diện.
 *
 *   3. Chrome bỏ qua `autoComplete="off"` với ô trông giống ô đăng nhập, nên nó
 *      tự điền EMAIL vào đây. Không mục cài đặt nào khớp "…@gmail.com" → cả
 *      trang Cài đặt trống trơn dù người dùng chưa gõ gì.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'SettingsScreen.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Khối JSX của ô tìm. */
const searchBlock = (() => {
    const i = src.indexOf('className="settings-search"');
    expect(i).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('settings-layout', i));
})();

describe('không giật khi gõ / xoá', () => {
    test('nút xoá LUÔN nằm trong DOM, chỉ đổi class', () => {
        // Gỡ khỏi DOM là ô nhập đổi bề rộng — đúng cái "giật".
        expect(searchBlock).not.toMatch(/\{navQuery && \(\s*<button/);
        expect(searchBlock).toMatch(/settings-search-clear\$\{navQuery \? ' is-visible' : ''\}/);
    });

    test('ẩn bằng visibility, không phải display', () => {
        // `display: none` bỏ nút khỏi luồng flex → vẫn đổi bề rộng.
        const r = css.match(/\.settings-search-clear\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/visibility:\s*hidden/);
        expect(r[1]).not.toMatch(/display:\s*none/);
        expect(css).toMatch(/\.settings-search-clear\.is-visible\s*\{[^}]*visibility:\s*visible/);
    });

    test('nút ẩn thì không bắt được tiêu điểm bàn phím', () => {
        // Còn tab được vào nút vô hình là bẫy cho người dùng bàn phím.
        expect(searchBlock).toMatch(/tabIndex=\{navQuery \? 0 : -1\}/);
        expect(searchBlock).toMatch(/aria-hidden=\{!navQuery\}/);
    });
});

describe('chỉ MỘT nút xoá', () => {
    test('dùng type="text", không phải type="search"', () => {
        expect(searchBlock).toMatch(/type="text"/);
        expect(searchBlock).not.toMatch(/type="search"/);
    });

    test('vẫn ẩn nút × mặc định của trình duyệt phòng khi đổi lại', () => {
        expect(css).toMatch(/-webkit-search-cancel-button/);
    });
});

describe('chặn trình duyệt tự điền', () => {
    test('có đủ các thuộc tính chặn autofill', () => {
        // `autoComplete="off"` một mình KHÔNG đủ với Chrome.
        for (const attr of [
            'autoComplete="off"',
            'data-form-type="other"',
            'data-1p-ignore',
            'data-lpignore',
        ]) {
            expect(searchBlock, `thiếu ${attr}`).toContain(attr);
        }
    });

    test('name không gợi ý đây là ô đăng nhập', () => {
        // Tên kiểu "search"/"email" làm trình quản lý mật khẩu nhận nhầm.
        expect(searchBlock).toMatch(/name="settings-filter-query"/);
    });

    test('nền autofill của Chrome bị ghi đè', () => {
        // `background` thường không thắng được — phải dùng box-shadow inset dày.
        expect(css).toMatch(/:-webkit-autofill/);
        expect(css).toMatch(/-webkit-box-shadow:\s*0 0 0 1000px/);
        expect(css).toMatch(/-webkit-text-fill-color/);
    });
});

describe('hàng "Tùy chỉnh…" — ô nhập số không bị bóp', () => {
    const general = readFileSync(join(__dirname, 'panels', 'GeneralPanel.jsx'), 'utf8');

    test('cụm được NỚI RỘNG khi bật Tùy chỉnh', () => {
        // Ghim 240px như hàng thường thì ba thứ (select + ô số + "/ 990") chia
        // nhau chỗ của MỘT select: ô số còn ~40px và "750" hiện ra "75".
        expect(general).toMatch(/setting-inline-group--with-number/);
        expect(general).toMatch(/isTargetCustom \? ' setting-inline-group--with-number' : ''/);
        expect(general).toMatch(/isGoalCustom \? ' setting-inline-group--with-number' : ''/);
    });

    test('lớp nới rộng có bề rộng lớn hơn 240px', () => {
        const r = css.match(/\.setting-inline-group--with-number\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        const w = parseInt(r[1].match(/width:\s*(\d+)px/)?.[1] || '0', 10);
        expect(w).toBeGreaterThan(240);
    });

    test('ô số ghim bề rộng, không co theo select', () => {
        const r = css.match(/\.setting-inline-group input\[type="number"\]\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/flex:\s*0 0 \d+px/);
        expect(r[1]).toMatch(/text-align:\s*right/);
    });

    test('bỏ style inline, dùng class chung', () => {
        // `style={{ width: 64 }}` rải trong JSX thì mỗi hàng một kiểu, và không
        // ghi đè được ở khổ điện thoại.
        expect(general).not.toMatch(/style=\{\{ width: 64, minWidth: 0 \}\}/);
        expect(general).toMatch(/className="setting-inline-unit"/);
    });

    test('mobile: select nhường chỗ cho ô số', () => {
        // Bản mobile ép mọi select trong cụm `width: 100% !important` — giữ
        // nguyên thì ô số bị đẩy hẳn xuống dòng dưới.
        const resp = readFileSync(
            join(__dirname, '..', '..', 'assets', 'styles', 'responsive.css'), 'utf8');
        expect(resp).toMatch(/\.setting-inline-group--with-number select\s*\{[^}]*width:\s*auto\s*!important/);
    });
});

describe('lối thoát khi không khớp gì', () => {
    test('hiện từ khoá đang lọc để biết vì sao trống', () => {
        expect(src).toMatch(/Không có mục nào khớp/);
        expect(src).toMatch(/\{navQuery\}/);
    });

    test('có nút xoá từ khoá ngay tại chỗ', () => {
        // Trình duyệt tự điền thì người dùng không hề gõ gì mà trang vẫn trống —
        // phải có đường thoát ngay chỗ họ đang nhìn.
        expect(src).toMatch(/settings-empty-reset/);
        expect(src).toMatch(/onClick=\{\(\) => setNavQuery\(''\)\}/);
    });
});
