/**
 * Ô tìm kiếm KHÔNG được để trình duyệt tự điền.
 *
 * Chrome/Edge điền username vào ô tìm ở màn Cài đặt lúc tải trang. Hậu quả nặng
 * hơn một ô bị bẩn: không mục cài đặt nào khớp "admin" nên CẢ TRANG trống trơn,
 * người dùng tưởng trang hỏng — mà họ không hề gõ gì.
 *
 * `autoComplete="off"` KHÔNG cứu được: đặc tả cho phép trình duyệt bỏ qua nó, và
 * Chrome bỏ qua có chủ đích với ô trông giống ô đăng nhập. Thứ chặn được là
 * `readOnly` cho tới khi người dùng thật sự chạm vào — trình duyệt không điền
 * vào ô chỉ đọc.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const settings = readFileSync(join(__dirname, 'SettingsScreen.jsx'), 'utf8');
const nav = readFileSync(
    join(__dirname, '..', '..', 'layouts', 'TopNav.jsx'), 'utf8');

/** Cụm thuộc tính của thẻ input có id cho trước. */
function theInput(src, id) {
    const i = src.indexOf(`id="${id}"`);
    expect(i, `không tìm thấy #${id}`).toBeGreaterThan(-1);
    // Lùi về đầu thẻ rồi lấy tới dấu đóng.
    const mo = src.lastIndexOf('<input', i);
    return src.slice(mo, src.indexOf('/>', i) + 2);
}

describe('ô tìm ở màn Cài đặt', () => {
    const input = theInput(settings, 'settings-search-input');

    test('khoá readOnly cho tới khi người dùng chạm', () => {
        // Đây là lớp DUY NHẤT chắc chắn — mọi thuộc tính khác chỉ là gợi ý mà
        // trình duyệt được phép bỏ qua.
        expect(input).toMatch(/readOnly=\{searchReadOnly\}/);
        expect(settings).toMatch(/const \[searchReadOnly, setSearchReadOnly\] = useState\(true\)/);
    });

    test('mở khoá bằng CẢ chuột, phím và cảm ứng', () => {
        // Thiếu một lối là ô đó không gõ được — đổi một lỗi lấy một lỗi tệ hơn.
        expect(input).toMatch(/onFocus=\{\(\) => setSearchReadOnly\(false\)\}/);
        expect(input).toMatch(/onMouseDown=\{\(\) => setSearchReadOnly\(false\)\}/);
        expect(input).toMatch(/onTouchStart=\{\(\) => setSearchReadOnly\(false\)\}/);
    });

    test('autoComplete KHÔNG phải "off"', () => {
        // "off" nằm trong đặc tả nên trình duyệt biết đó là gì và được phép bỏ
        // qua; token lạ thì nó không biết điền gì.
        expect(input).not.toMatch(/autoComplete="off"/);
        expect(input).toMatch(/autoComplete="[a-z-]+"/);
    });

    test('KHÔNG dùng "new-password"', () => {
        // Nó chặn được autofill nhưng làm trình quản lý mật khẩu gợi ý TẠO mật
        // khẩu mới ngay trên ô tìm kiếm.
        expect(input).not.toMatch(/autoComplete="new-password"/);
    });

    test('giữ các lớp chặn cũ', () => {
        // Không lớp nào đủ một mình, nhưng bỏ đi thì mất phần chặn được trình
        // quản lý mật khẩu của bên thứ ba.
        expect(input).toMatch(/data-1p-ignore/);
        expect(input).toMatch(/data-lpignore/);
        expect(input).toMatch(/data-form-type="other"/);
    });

    test('vẫn có lối thoát khi ô bị điền bẩn', () => {
        // Nếu một trình duyệt nào đó vẫn lách qua được, người dùng phải xoá được
        // ngay tại chỗ họ đang nhìn — trang trống trơn thì họ không biết vì sao.
        expect(settings).toMatch(/settings-empty-reset/);
        expect(settings).toMatch(/Xoá từ khoá/);
    });
});

describe('ô tìm trên thanh nav', () => {
    const input = theInput(nav, 'search-input');

    test('cũng có readOnly', () => {
        expect(input).toMatch(/readOnly=\{searchReadOnly \|\| isInPractice\}/);
    });

    test('autoComplete cũng không phải "off"', () => {
        expect(input).not.toMatch(/autoComplete="off"/);
    });

    test('mở khoá khi chạm', () => {
        expect(input).toMatch(/setSearchReadOnly\(false\)/);
    });
});
