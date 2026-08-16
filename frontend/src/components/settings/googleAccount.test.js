/**
 * Tài khoản Google không có mật khẩu → không hiện form "Đổi mật khẩu".
 *
 * Hiện ra thì người dùng gõ mãi không được: họ không có "mật khẩu hiện tại" nào
 * để nhập, và bấm Lưu thì server trả lỗi. Không có gì trên màn hình nói vì sao.
 *
 * Nhưng cũng KHÔNG ẩn trơn — ẩn im lặng thì lại tưởng app thiếu tính năng. Thay
 * bằng ghi chú nói rõ lý do và chỉ chỗ đổi (bên Google).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panel = readFileSync(join(__dirname, 'panels', 'AccountPanel.jsx'), 'utf8');
const screen = readFileSync(join(__dirname, 'SettingsScreen.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('AccountPanel phân biệt tài khoản Google', () => {
    test('nhận prop isGoogleAccount', () => {
        expect(panel).toMatch(/isGoogleAccount,/);
    });

    test('Google → hiện ghi chú, KHÔNG hiện form', () => {
        expect(panel).toMatch(/isGoogleAccount \? \(/);
        expect(panel).toMatch(/settings-note/);
    });

    test('ghi chú nói rõ lý do và chỉ chỗ đổi', () => {
        // "Không khả dụng" thì người dùng không biết làm gì tiếp.
        expect(panel).toMatch(/đăng nhập bằng Google/);
        expect(panel).toMatch(/tài khoản Google/);
    });

    test('tài khoản thường VẪN có đủ form', () => {
        // Nhánh else phải còn nguyên ô nhập và nút lưu.
        expect(panel).toMatch(/PASSWORD_FIELDS\.map/);
        expect(panel).toMatch(/Lưu mật khẩu mới/);
    });
});

describe('SettingsScreen truyền cờ xuống', () => {
    test('lấy từ GameState.user.isGoogleAccount', () => {
        expect(screen).toMatch(
            /isGoogleAccount=\{!!GameState\.state\?\.user\?\.isGoogleAccount\}/);
    });

    test('ép về boolean — undefined không được lọt xuống làm prop', () => {
        // Tài khoản cũ chưa có cờ này thì `undefined`; `!!` cho ra false =
        // tài khoản thường, đúng mặc định an toàn.
        expect(screen).toMatch(/!!GameState\.state\?\.user\?\.isGoogleAccount/);
    });
});

describe('kiểu ghi chú', () => {
    test('có lớp .settings-note', () => {
        expect(css).toMatch(/\.settings-note\s*\{/);
    });

    test('dùng biến màu theo chủ đề, không ghi cứng màu', () => {
        // Ghi cứng thì ở nền tối chữ chìm vào nền.
        const r = css.match(/\.settings-note\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/var\(--text-secondary\)/);
        expect(r[1]).toMatch(/var\(--bg-secondary\)/);
    });
});
