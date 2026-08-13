/**
 * Cài đặt: tìm nhanh + accordion trên điện thoại.
 *
 * Trước đây màn Cài đặt trên điện thoại ẩn hẳn thanh điều hướng rồi
 * `display: block !important` cho MỌI panel — cả 7 nhóm đổ ra một trang dài,
 * phải cuộn rất lâu mới tới nhóm cần và không có cách nào thu lại.
 *
 * Bốn chỗ dễ hỏng im lặng:
 *   1. Nút và panel nằm ở hai khối DOM rời (nav / panels) thì KHÔNG BAO GIỜ làm
 *      accordion được — panel không thể nằm dưới nút của nó.
 *   2. `display: block !important` cũ đè lên mọi quy tắc viết sau; còn sót là
 *      accordion không có tác dụng, mà CSS vẫn hợp lệ nên không có gì báo.
 *   3. Tìm kiếm chỉ khớp theo NHÃN thì gõ "mật khẩu" ra rỗng, dù nó nằm ngay
 *      trong nhóm Tài khoản — rỗng thì trông như trang hỏng.
 *   4. Lọc xong mà mục khớp vẫn đóng thì tìm được rồi vẫn phải bấm thêm lần nữa.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const jsx = strip(readFileSync(join(__dirname, 'SettingsScreen.jsx'), 'utf8'));
const css = readFileSync(join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Lấy đúng khối `@media (max-width: 640px)` NÓI VỀ CÀI ĐẶT.
 *
 * File có nhiều khối 640px; bắt cái đầu tiên là kiểm nhầm khối khác rồi kết
 * luận sai — đã dính một lần: nó trả về khối `.practice-header`.
 */
function matchSettingsMedia() {
    const re = /@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = re.exec(css)) !== null) {
        if (m[1].includes('.settings-item')) return m;
    }
    expect.fail('không tìm thấy khối @media 640px của Cài đặt');
}

describe('cấu trúc: nút và panel cạnh nhau', () => {
    test('render MỘT vòng lặp, mỗi mục bọc cả nút lẫn panel', () => {
        // Hai khối rời (nav / panels) thì panel không thể nằm dưới nút của nó.
        expect(jsx).toMatch(/className=\{\[\s*'settings-item'/);
        expect(jsx).not.toMatch(/className="settings-panels"/);
        expect(jsx).not.toMatch(/<nav className="settings-nav">/);
    });

    test('chỉ dựng panel của mục ĐANG mở', () => {
        // Dựng cả 7 panel rồi ẩn bằng CSS là bảy lần render thừa mỗi lần đổi mục.
        expect(jsx).toMatch(/item\.key === 'general' && \(/);
        expect(jsx).toMatch(/item\.key === 'report' && \(/);
    });

    test('bấm lại mục đang mở thì ĐÓNG nó', () => {
        expect(jsx).toMatch(/setActiveSection\(open \? '' : item\.key\)/);
    });

    test('nút khai báo trạng thái mở cho trình đọc màn hình', () => {
        expect(jsx).toMatch(/aria-expanded=\{open\}/);
    });
});

describe('CSS: hai cột trên máy tính, accordion trên màn nhỏ', () => {
    test('KHÔNG còn `display: block !important` mở hết mọi panel', () => {
        // Quy tắc cũ đè lên mọi thứ viết sau nó.
        expect(css).not.toMatch(/\.settings-panel\s*\{\s*display:\s*block\s*!important/);
    });

    test('máy tính: panel của mục đang mở nằm ở cột phải', () => {
        expect(css).toMatch(/\.settings-item\.open \.settings-panel\s*\{[^}]*position:\s*absolute/);
    });

    test('màn nhỏ: thôi định vị tuyệt đối → panel rơi xuống dưới nút', () => {
        const m = matchSettingsMedia();
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/\.settings-item\.open \.settings-panel\s*\{[^}]*position:\s*static/);
    });

    test('mũi tên chỉ hiện ở dạng accordion, và xoay khi mở', () => {
        expect(css).toMatch(/\.settings-nav-caret\s*\{\s*display:\s*none/);
        const m = matchSettingsMedia();
        expect(m[1]).toMatch(/\.settings-item\.open \.settings-nav-caret\s*\{[^}]*rotate\(180deg\)/);
    });

    test('không còn quy tắc mồ côi `.settings-nav` (đã bỏ khỏi JSX)', () => {
        expect(css).not.toMatch(/(^|\n)\.settings-nav\s*\{/);
    });

    test('dòng TRẢI HẾT bề ngang — `flex-start` bóp panel thành một chữ mỗi dòng', () => {
        // Ở flex CỘT, trục ngang là trục phụ: `align-items: flex-start` co mỗi
        // dòng về đúng bề rộng nội dung. Panel nằm trong dòng đó hẹp theo, và
        // chữ bị ép xuống thành MỘT CHỮ MỖI DÒNG — đúng triệu chứng đã gặp.
        const m = css.match(/\.settings-layout\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/align-items:\s*stretch/);
        expect(m[1]).not.toMatch(/align-items:\s*flex-start/);
    });

    test('chỉ MỘT quy tắc .settings-layout — hai bản là sửa nhầm chỗ', () => {
        expect((css.match(/(^|\n)\.settings-layout\s*\{/g) || [])).toHaveLength(1);
    });
});

describe('tìm nhanh', () => {
    test('khớp cả TỪ KHOÁ, không chỉ nhãn', () => {
        // Người dùng gõ thứ họ muốn đổi ("mật khẩu"), không gõ tên nhóm.
        expect(jsx).toMatch(/keywords:/);
        expect(jsx).toMatch(/fold\(item\.keywords\)\.includes\(w\)/);
    });

    test('bỏ dấu tiếng Việt — gõ "mat khau" cũng ra', () => {
        expect(jsx).toMatch(/normalize\('NFD'\)/);
        expect(jsx).toMatch(/u0300-\\u036f/);
        // 'đ' KHÔNG phải dấu tổ hợp nên NFD không tách được, phải xử riêng.
        expect(jsx).toMatch(/replace\(\/đ\/g, 'd'\)/);
    });

    test('nhiều từ thì phải khớp HẾT, không phải khớp một cái là xong', () => {
        expect(jsx).toMatch(/\.every\(w =>/);
    });

    test('gõ tìm thì tự MỞ mục khớp đầu tiên', () => {
        // Không thì tìm được rồi vẫn phải bấm thêm một lần nữa.
        expect(jsx).toMatch(/const first = NAV_ITEMS\.find\(it => matches\(it, value\)\)/);
        expect(jsx).toMatch(/if \(first\) setActiveSection\(first\.key\)/);
    });

    test('mở mục khớp ngay trong onChange, KHÔNG qua useEffect', () => {
        // Đây là hệ quả trực tiếp của thao tác gõ, không phải đồng bộ với hệ
        // thống bên ngoài. Đặt vào effect là thêm một lượt render thừa — eslint
        // cũng bắt (`cascading renders`).
        expect(jsx).toMatch(/onChange=\{\(e\) => handleNavQuery\(e\.target\.value\)\}/);
        const i = jsx.indexOf('const handleNavQuery');
        expect(jsx.slice(Math.max(0, i - 200), i)).not.toMatch(/useEffect\(/);
    });

    test('không khớp gì thì NÓI, không để trang trắng', () => {
        expect(jsx).toMatch(/visibleCount === 0 &&/);
        expect(jsx).toMatch(/Không có mục nào khớp/);
    });
});
