/**
 * Nút X đóng sidebar admin phải hoạt động NGAY, không chờ dashboard tải xong.
 *
 * Lỗi đã gặp: nút gọi `window.collapseSidebar && window.collapseSidebar()`, mà
 * hàm đó chỉ được gán bên trong `initMainTabs()` — và `initMainTabs()` lại chạy
 * SAU `await loadDashboard()` trong `initDashboard()`:
 *
 *     async function initDashboard() {
 *       await loadDashboard();   // gọi mạng, có thể chậm hoặc lỗi
 *       initMainTabs();          // ← chỉ tới đây window.collapseSidebar mới tồn tại
 *     }
 *
 * Nên trong lúc dashboard còn đang tải, bấm X KHÔNG XẢY RA GÌ và cũng không báo
 * gì — nhờ toán tử `&&` nên không có cả lỗi trong console. Hỏng im lặng.
 *
 * Đóng menu chỉ là gỡ một class CSS; nó không có lý do gì phải phụ thuộc vào một
 * lời gọi mạng. Test này chốt: handler không được đi qua `window.collapseSidebar`.
 *
 * Test thuần: render HTML rồi đọc chuỗi, không nạp trình duyệt.
 */
const { renderAdminDashboard } = require('../utils/renderAdminDashboard');

describe('Sidebar admin — nút đóng không phụ thuộc thời điểm khởi tạo', () => {
    const html = renderAdminDashboard();

    test('nút đóng có mặt trong trang', () => {
        expect(html).toContain('sidebar-close-brand');
    });

    test('handler tự gỡ class, KHÔNG gọi qua window.collapseSidebar', () => {
        // Lấy đúng thẻ button của nút đóng để không bắt nhầm chỗ khác.
        const btn = /<button[^>]*id="sidebar-close-brand"[\s\S]*?<\/button>/.exec(html);
        expect(btn).not.toBeNull();

        expect(btn[0]).toMatch(/classList\.add\(\s*'collapsed'\s*\)/);
        // Đây là điều kiện thật sự bảo vệ: phụ thuộc vào hàm gán muộn là hỏng.
        expect(btn[0]).not.toMatch(/window\.collapseSidebar/);
    });

    test('phần tử mà handler thao tác PHẢI tồn tại trong trang', () => {
        // Handler gọi thẳng theo id. Đổi id sidebar mà quên sửa nút thì nút lại
        // chết im lặng y như cũ — chốt luôn ở đây.
        expect(html).toContain('id="admin-sidebar"');
    });
});
