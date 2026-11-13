/**
 * Tab admin "Bài nghe" (JS thuần trong public/admin).
 *
 * Chỗ dễ hỏng: thông báo sau khi thêm bài đọc nhầm tầng phản hồi (từng hiện `Đã thêm "undefined":
 * undefined câu`), nút Sửa/Xoá không nối sự kiện, xoá không hỏi lại, form sửa thêm/bớt câu.
 */
const fs = require('fs');
const path = require('path');

const ADMIN = path.join(__dirname, '..', 'public', 'admin');
const js = fs.readFileSync(path.join(ADMIN, 'js', 'features', 'vocab', 'bai-nghe-admin.js'), 'utf8');
const html = fs.readFileSync(path.join(ADMIN, 'partials', 'tabs', 'bai-nghe.html'), 'utf8');

test('thêm bài: đọc đúng tầng { bai } của phản hồi', () => {
    expect(js).toMatch(/const \{ bai: b \} = await goi\('', \{ method: 'POST', json: thongTin \}\);/);
});

test('mỗi dòng có ảnh bìa (bấm mở file), nút Sửa, Ẩn/Hiện, Xoá hẳn', () => {
    expect(js).toMatch(/<td>\$\{anhNho\(b\)\}<\/td>/);
    expect(js).toMatch(/data-sua="\$\{esc\(b\.id\)\}"/);
    expect(js).toMatch(/data-xoa="\$\{esc\(b\.id\)\}"/);
    expect(js).toMatch(/target="_blank" rel="noopener noreferrer"/);
    // Link ảnh và file chỉ nhận https.
    expect(js).toContain(String.raw`/^https:\/\//.test(b.mediaUrl`);
    expect(js).toContain(String.raw`/^https:\/\//.test(b.anhBia`);
});

test('hộp thoại sửa: sửa thông tin và chữ từng câu, có nút xoá bài; xoá luôn hỏi lại', () => {
    for (const id of ['bn-sua-modal', 'bn-sua-tieu-de', 'bn-sua-cap-do', 'bn-sua-nguon', 'bn-sua-nguon-url', 'bn-sua-script', 'bn-sua-xoa', 'bn-sua-luu']) {
        expect(html).toContain(`id="${id}"`);
    }
    expect(js).toMatch(/method: 'PATCH',\s*json: \{[\s\S]*?cau,/);
    expect(js).toMatch(/async function xoaBai\(id, ten\) \{\s*if \(!confirm\(/);
    expect(js).toMatch(/getElementById\('bn-sua-xoa'\)\?\.addEventListener/);
});
