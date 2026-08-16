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
    test('nhận cả hai prop', () => {
        expect(panel).toMatch(/isGoogleAccount,/);
        expect(panel).toMatch(/hasUsablePassword,/);
    });

    test('điều kiện là hasUsablePassword, KHÔNG phải isGoogleAccount', () => {
        // Chặn theo isGoogleAccount là cướp quyền đổi mật khẩu của người đăng ký
        // email+mật khẩu TRƯỚC rồi mới liên kết Google — họ có mật khẩu THẬT.
        expect(panel).toMatch(/\{!hasUsablePassword \? \(/);
        expect(panel).not.toMatch(/\{isGoogleAccount \? \(/);
        expect(panel).toMatch(/settings-note/);
    });

    test('ghi chú chỉ ĐÚNG lối thoát (Quên mật khẩu)', () => {
        // "Không khả dụng" thì người dùng không biết làm gì tiếp.
        expect(panel).toMatch(/Quên mật khẩu/);
    });

    test('isGoogleAccount chỉ dùng để nói đúng LÝ DO', () => {
        // Chưa có mật khẩu có thể vì Google, cũng có thể vì lý do khác — câu chữ
        // phải khớp, nhưng không được dùng nó làm điều kiện ẩn/hiện.
        expect(panel).toMatch(/isGoogleAccount$/m);
        expect(panel).toMatch(/đăng nhập bằng Google/);
    });

    test('tài khoản thường VẪN có đủ form', () => {
        // Nhánh else phải còn nguyên ô nhập và nút lưu.
        expect(panel).toMatch(/PASSWORD_FIELDS\.map/);
        expect(panel).toMatch(/Lưu mật khẩu mới/);
    });
});

describe('SettingsScreen truyền cờ xuống', () => {
    test('lấy cả hai cờ từ GameState', () => {
        expect(screen).toMatch(
            /isGoogleAccount=\{!!GameState\.state\?\.user\?\.isGoogleAccount\}/);
        expect(screen).toMatch(/hasUsablePassword=\{GameState\.state\?\.user\?\.hasUsablePassword !== false\}/);
    });

    test('hasUsablePassword dùng !== false, KHÔNG dùng !!', () => {
        // Tài khoản cũ (và phiên đăng nhập cũ) chưa có trường này thì
        // `undefined`. `!!undefined` = false → ẩn form của TẤT CẢ người dùng cũ.
        // `!== false` cho true, đúng mặc định an toàn.
        expect(screen).not.toMatch(/hasUsablePassword=\{!!GameState/);
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
