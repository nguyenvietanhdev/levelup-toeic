/**
 * Phản hồi API không được nằm trong cache của trình duyệt.
 *
 * Express bật ETag MẶC ĐỊNH cho mọi phản hồi. Với API dữ liệu động thì đó là
 * cái bẫy: trình duyệt gửi kèm `If-None-Match`, server thấy hash nội dung chưa
 * đổi nên trả 304, và `fetch` dùng lại body CŨ trong cache.
 *
 * Triệu chứng thật: bấm "Tải lại" ở popup Chọn đề thì danh sách không đổi —
 * phải đóng popup mở lại mới thấy dữ liệu mới. Không có lỗi nào, request vẫn
 * 200/304 bình thường, nên rất khó lần ra.
 *
 * Test đọc cấu hình server: dựng cả app lên để gọi thật thì cần DB + Redis.
 */
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

describe('không cache phản hồi API', () => {
    test('tắt ETag của Express', () => {
        expect(server).toMatch(/app\.set\('etag', false\)/);
    });

    test('gắn Cache-Control: no-store cho mọi route /api', () => {
        expect(server).toMatch(/app\.use\('\/api', \(req, res, next\) => \{/);
        expect(server).toMatch(/no-store, no-cache, must-revalidate/);
    });

    test('đặt TRƯỚC các route /api — không thì middleware không chạy', () => {
        // Express chạy middleware theo thứ tự khai báo; đặt sau route đã trả
        // phản hồi thì nó vô nghĩa.
        const guard = server.indexOf("app.use('/api', (req, res, next)");
        const firstApiRoute = server.indexOf("app.use('/api/admin'");
        expect(guard).toBeGreaterThan(-1);
        expect(firstApiRoute).toBeGreaterThan(-1);
        expect(guard).toBeLessThan(firstApiRoute);
    });

    test('KHÔNG đụng tới file tĩnh', () => {
        // `express.static` tự đặt ETag/Last-Modified riêng, không phụ thuộc
        // `app.set('etag')` — ảnh/JS/CSS vẫn được cache như thường.
        // Guard chỉ nhắm '/api', không nhắm '/'.
        const guardLine = server.match(/app\.use\('([^']*)', \(req, res, next\) => \{\s*\n\s*res\.set\('Cache-Control'/);
        expect(guardLine).toBeTruthy();
        expect(guardLine[1]).toBe('/api');
    });
});
