/**
 * Chỉ báo trạng thái máy chủ trên thanh admin: ẨN khi bình thường.
 *
 * "Online" là trạng thái mặc định — hiện nó ra chỉ để nói điều hiển nhiên và
 * chiếm chỗ trên thanh. Nhưng KHÔNG được xoá phần tử: hai trạng thái còn lại có
 * ích thật —
 *   · "Offline" — Render cho service ngủ sau 15 phút không có truy cập;
 *   · "Đang khởi động…" — chính là thứ giải thích vì sao màn hình đứng im ~30
 *     giây, không có nó thì người dùng tưởng panel treo.
 *
 * Hai chỗ dễ hỏng im lặng:
 *   1. Xoá luôn phần tử → mất cả hai trạng thái có ích, mà lúc mất thì không ai
 *      biết vì trang vẫn chạy bình thường.
 *   2. Ẩn chỉ báo mà để lại vạch ngăn của nó → thanh có hai vạch dính nhau.
 */
const fs = require('fs');
const path = require('path');

const ADMIN = path.join(__dirname, '..', 'public', 'admin');
const core = fs.readFileSync(path.join(ADMIN, 'js', 'core', 'core.js'), 'utf8');
const topbar = fs.readFileSync(path.join(ADMIN, 'partials', 'layout', 'topbar.html'), 'utf8');
const css = fs.readFileSync(path.join(ADMIN, 'css', 'dashboard.css'), 'utf8');

describe('trạng thái Online thì ẩn chỉ báo', () => {
    test('nhánh Online gắn class ẩn', () => {
        expect(core).toMatch(/dotEl\.className = "status-dot online is-hidden"/);
    });

    test('CSS ẩn bằng display, không phải visibility', () => {
        // `visibility: hidden` vẫn chiếm chỗ — thanh thủng đúng một khoảng bằng
        // chỉ báo, tức là không giải quyết được gì.
        expect(css).toMatch(/\.status-dot\.is-hidden\s*\{[^}]*display:\s*none/);
        expect(css).not.toMatch(/\.status-dot\.is-hidden\s*\{[^}]*visibility/);
    });

    test('vạch ngăn của chỉ báo ẩn theo', () => {
        expect(css).toMatch(/:has\(\.status-dot\.is-hidden\)[^{]*\.topbar-divider\[data-for="server-status"\]/);
    });

    test('chỉ còn MỘT vạch ngăn quanh chỉ báo', () => {
        // Trước có hai vạch kẹp hai bên; ẩn chỉ báo là chúng dính vào nhau.
        const seg = topbar.slice(topbar.indexOf('season-countdown'),
                                 topbar.indexOf('theme-toggle'));
        expect((seg.match(/topbar-divider/g) || [])).toHaveLength(1);
    });
});

describe('hai trạng thái CÓ ÍCH vẫn còn nguyên', () => {
    test('Offline vẫn hiện (không kèm class ẩn)', () => {
        // Render ngủ sau 15 phút — đây là lúc người dùng cần biết nhất.
        expect(core).toMatch(/dotEl\.textContent = "Offline"/);
        expect(core).toMatch(/dotEl\.className = "status-dot offline"/);
        expect(core).not.toMatch(/status-dot offline is-hidden/);
    });

    test('"Đang khởi động…" vẫn hiện', () => {
        expect(core).toMatch(/dot\.textContent = "Đang khởi động…"/);
        expect(core).toMatch(/dot\.className = "status-dot waking"/);
        expect(core).not.toMatch(/status-dot waking is-hidden/);
    });

    test('phần tử KHÔNG bị xoá khỏi HTML', () => {
        expect(topbar).toMatch(/id="topbar-server-status"/);
    });
});

describe('nút ẩn/hiện sidebar', () => {
    test('đã có sẵn trên thanh, không phải thêm mới', () => {
        expect(topbar).toMatch(/id="sidebar-toggle"/);
        expect(topbar).toMatch(/fa-bars/);
    });

    test('có xử lý bật/tắt thật, không phải nút chết', () => {
        const ui = fs.readFileSync(path.join(ADMIN, 'js', 'core', 'ui-init.js'), 'utf8');
        expect(ui).toMatch(/getElementById\('sidebar-toggle'\)/);
        expect(ui).toMatch(/classList\.contains\('collapsed'\)/);
    });
});
