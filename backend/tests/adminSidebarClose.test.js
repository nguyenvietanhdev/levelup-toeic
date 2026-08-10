/**
 * Nút X đóng sidebar admin phải THẬT SỰ chạy được.
 *
 * Đã hỏng vì HAI nguyên nhân chồng lên nhau, và tôi chỉ thấy cái thứ hai sau khi
 * người dùng gửi log console:
 *
 * 1. CSP CHẶN MỌI `onclick=` INLINE — đây mới là nguyên nhân chính.
 *    server.js đặt `script-src-attr 'none'` (mặc định của helmet), nên trình duyệt
 *    chặn thẳng mọi thuộc tính sự kiện inline:
 *        "Executing inline event handler violates ... script-src-attr 'none'"
 *    Nút có `onclick` thì không bao giờ chạy, bất kể bên trong viết gì.
 *
 * 2. Hàm gán muộn. Bản `onclick` cũ gọi `window.collapseSidebar`, thứ chỉ được gán
 *    trong initMainTabs() — mà hàm đó chạy SAU `await loadDashboard()`.
 *
 * Bản vá đầu của tôi chỉ chữa (2) bằng cách viết lại nội dung `onclick`, nên vẫn
 * chết vì (1). Test cũ cũng sai theo: nó khoá "onclick phải gọi classList.add",
 * tức là khoá một thứ CSP không cho chạy.
 *
 * Test này chốt điều kiện ĐÚNG: nút không được có thuộc tính sự kiện inline, và
 * phải có handler nối bằng addEventListener trong ui-init.js.
 *
 * Test thuần: render HTML + đọc file nguồn, không nạp trình duyệt.
 */
const fs = require('fs');
const path = require('path');
const { renderAdminDashboard } = require('../utils/renderAdminDashboard');

const html = renderAdminDashboard();
const uiInit = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'js', 'core', 'ui-init.js'), 'utf8'
);

describe('Sidebar admin — nút đóng phải chạy được dưới CSP', () => {

    test('nút đóng có mặt trong trang', () => {
        expect(html).toContain('sidebar-close-brand');
    });

    test('nút KHÔNG có thuộc tính sự kiện inline — CSP chặn thẳng', () => {
        const btn = /<button[^>]*id="sidebar-close-brand"[^>]*>/.exec(html);
        expect(btn).not.toBeNull();
        expect(btn[0]).not.toMatch(/\son[a-z]+\s*=/i);
    });

    test('handler nối bằng addEventListener trong ui-init.js', () => {
        expect(uiInit).toMatch(
            /getElementById\(\s*'sidebar-close-brand'\s*\)\s*\?\.addEventListener\(\s*'click'/
        );
    });

    test('handler nằm trong DOMContentLoaded, không nằm trong initMainTabs', () => {
        // initMainTabs() chạy sau `await loadDashboard()`; nối handler ở đó thì bấm
        // X lúc dashboard còn tải sẽ không xảy ra gì.
        const initMainTabs = /function initMainTabs\(\)[\s\S]*?\n\}/.exec(uiInit);
        expect(initMainTabs).not.toBeNull();
        expect(initMainTabs[0]).not.toContain('sidebar-close-brand');
    });

    test('CẢ panel admin không còn thuộc tính sự kiện inline nào', () => {
        // Mở rộng thành luật chung: một `onclick` lọt vào là chết im lặng y hệt,
        // chỉ có một dòng cảnh báo trong console mà không ai đọc.
        const dir = path.join(__dirname, '..', 'public', 'admin');
        const offenders = [];
        const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory()) { walk(p); continue; }
                if (!e.name.endsWith('.html')) continue;
                const src = fs.readFileSync(p, 'utf8');
                for (const m of src.matchAll(/<[a-z][^>]*?\son(click|change|input|submit)\s*=/gi)) {
                    offenders.push(`${path.relative(dir, p).replace(/\\/g, '/')} → on${m[1]}`);
                }
            }
        };
        walk(dir);
        expect(offenders).toEqual([]);
    });

    test('phần tử mà handler thao tác PHẢI tồn tại trong trang', () => {
        expect(html).toContain('id="admin-sidebar"');
    });
});
