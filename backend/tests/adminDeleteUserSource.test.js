/**
 * Admin xóa nội dung người dùng tải lên.
 *
 * Trang "Nội dung người dùng" trước đây chỉ XEM được — thấy nội dung vi phạm
 * cũng không xử lý được gì.
 *
 * Ba chỗ dễ hỏng, hai trong đó là RỦI RO THẬT:
 *   1. Thiếu `authorize('admin')` → người dùng thường gọi thẳng endpoint để xóa
 *      dữ liệu của nhau. Không có gì khác chặn được.
 *   2. `onclick=` inline bị CSP (`script-src-attr 'none'`) chặn thẳng → nút
 *      không bao giờ chạy, mà nhìn giao diện vẫn bình thường.
 *   3. Thêm cột mà quên sửa `colspan` → dòng "đang tải"/"không có kết quả" lệch
 *      khỏi bảng.
 */
const fs = require('fs');
const path = require('path');

const controller = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8');
const routes = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'uploadRoutes.js'), 'utf8');
const tabs = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'js', 'core', 'tabs.js'), 'utf8');
const partial = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'partials', 'tabs', 'upload-management.html'), 'utf8');

/** Thân hàm adminDeleteUserSource. */
function handlerBody() {
    const i = controller.indexOf('exports.adminDeleteUserSource');
    expect(i).toBeGreaterThan(-1);
    const j = controller.indexOf('exports.', i + 10);
    return controller.slice(i, j > -1 ? j : controller.length);
}

describe('quyền truy cập', () => {
    test('route CHỈ dành cho admin', () => {
        // Đây là thứ duy nhất ngăn người dùng thường xóa dữ liệu của nhau.
        expect(routes).toMatch(
            /router\.delete\(\s*'\/admin\/user-source\/:email\/:source',\s*protect,\s*authorize\('admin'\)/);
    });

    test('được export từ controller', () => {
        expect(routes).toMatch(/adminDeleteUserSource,/);
        expect(controller).toMatch(/exports\.adminDeleteUserSource/);
    });
});

describe('controller', () => {
    const body = handlerBody();

    test('chuẩn hoá email về chữ thường', () => {
        // `ownerEmail` lưu lowercase; không chuẩn hoá là khớp 0 bản ghi rồi
        // báo 404 dù nguồn có thật.
        expect(body).toMatch(/toLowerCase\(\)/);
    });

    test('thiếu tham số thì từ chối', () => {
        expect(body).toMatch(/if \(!ownerEmail \|\| !source\)/);
        expect(body).toMatch(/status\(400\)/);
    });

    test('không tìm thấy thì 404, không im lặng báo thành công', () => {
        expect(body).toMatch(/if \(!matched\)/);
        expect(body).toMatch(/status\(404\)/);
    });

    test('lọc theo ĐÚNG chủ sở hữu + nguồn', () => {
        expect(body).toMatch(/\{ ownerEmail, source \}/);
    });

    test('ghi nhật ký — truy được ai xóa của ai', () => {
        // Admin xóa dữ liệu người khác thì phải có vết.
        expect(body).toMatch(/logActivity\(/);
        expect(body).toMatch(/admin-delete-user-source/);
    });

    test('log hỏng KHÔNG chặn thao tác đã xong', () => {
        // Xóa xong rồi mà ném lỗi vì ghi log thất bại thì client tưởng chưa xóa.
        expect(body).toMatch(/catch \{ \/\* log hỏng/);
    });
});

describe('giao diện admin', () => {
    test('bảng có cột Thao tác', () => {
        expect(partial).toMatch(/<th>Thao tác<\/th>/);
    });

    test('colspan khớp số cột mới (7)', () => {
        // Thêm cột mà quên colspan thì dòng "đang tải" lệch khỏi bảng.
        expect(partial).toMatch(/colspan="7"/);
        expect(partial).not.toMatch(/colspan="6"/);
    });

    test('nút xóa nối bằng addEventListener, KHÔNG onclick inline', () => {
        // CSP `script-src-attr 'none'` chặn thẳng thuộc tính sự kiện inline.
        expect(tabs).toMatch(/upload-del-btn/);
        expect(tabs).not.toMatch(/upload-del-btn[^`]*onclick=/);
        expect(tabs).toMatch(/tbody\.addEventListener\("click"/);
    });

    test('uỷ quyền ở tbody, không gắn từng nút', () => {
        // Hàng được dựng lại mỗi lần lọc — gắn trực tiếp thì listener cũ trỏ
        // vào nút đã bị gỡ khỏi DOM.
        expect(tabs).toMatch(/closest\("\.upload-del-btn"\)/);
        expect(tabs).toMatch(/dataset\.delBound/);
    });

    test('email và nguồn được mã hoá trong URL', () => {
        // Email có "@", nguồn có thể chứa ký tự lạ.
        const i = tabs.indexOf('/api/upload/admin/user-source/');
        expect(tabs.slice(i - 100, i + 200)).toMatch(/encodeURIComponent\(email\)/);
        expect(tabs.slice(i - 100, i + 200)).toMatch(/encodeURIComponent\(source\)/);
    });

    test('hỏi xác nhận, nói rõ xóa của AI và bao nhiêu từ', () => {
        expect(tabs).toMatch(/Không thể hoàn tác/);
        expect(tabs).toMatch(/\$\{n\} từ/);
    });

    test('xóa xong cập nhật danh sách tại chỗ, không gọi lại API', () => {
        expect(tabs).toMatch(/_uploadsData = _uploadsData\.filter\(/);
    });
});
