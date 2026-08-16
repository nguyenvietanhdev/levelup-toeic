/**
 * Tài khoản Google KHÔNG có mật khẩu — đổi mật khẩu phải báo đúng lý do.
 *
 * Schema chỉ bắt buộc `password` khi thiếu `googleId`, nên user đăng nhập bằng
 * Google có `user.password === undefined`. `changePassword` đi thẳng vào
 * `comparePassword` → `bcrypt.compare(x, undefined)` NÉM LỖI → người dùng nhận
 * 500 "lỗi máy chủ", tưởng app hỏng, trong khi thật ra tài khoản họ không dùng
 * mật khẩu.
 *
 * Và client cần biết điều đó để ẩn form: hiện ra thì người dùng gõ mãi không
 * được, vì không có "mật khẩu hiện tại" nào để nhập.
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');

describe('bcrypt.compare với mật khẩu undefined', () => {
    test('NÉM LỖI — đây là lý do phải chặn trước', () => {
        // Khoá lại giả định của bản sửa. Nếu bcrypt đổi hành vi thành trả false
        // thì test đỏ và ta biết để xem lại.
        return expect(bcrypt.compare('bat-ky', undefined)).rejects.toThrow();
    });
});

describe('schema: mật khẩu chỉ bắt buộc khi KHÔNG phải tài khoản Google', () => {
    test('user Google hợp lệ dù thiếu password', () => {
        const u = new User({
            username: 'gg-user',
            email: 'gg@example.com',
            googleId: 'sub-123',
        });
        expect(u.validateSync()?.errors?.password).toBeUndefined();
    });

    test('user thường THIẾU password thì báo lỗi', () => {
        const u = new User({ username: 'thuong', email: 'thuong@example.com' });
        expect(u.validateSync()?.errors?.password).toBeDefined();
    });
});

describe('controller chặn trước khi gọi bcrypt', () => {
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'controllers', 'authController.js'), 'utf8');

    /** Thân hàm changePassword. */
    const body = (() => {
        const i = src.indexOf('const changePassword =');
        expect(i).toBeGreaterThan(-1);
        const j = src.indexOf('\nconst logout =', i);
        expect(j).toBeGreaterThan(i);
        return src.slice(i, j);
    })();

    test('có nhánh !user.password trả 400', () => {
        expect(body).toMatch(/if \(!user\.password\)/);
        expect(body).toMatch(/status\(400\)/);
    });

    test('chặn NẰM TRƯỚC comparePassword', () => {
        // Sau thì vô nghĩa — bcrypt đã ném lỗi mất rồi.
        const guard = body.indexOf('if (!user.password)');
        const cmp = body.indexOf('user.comparePassword(');
        expect(guard).toBeGreaterThan(-1);
        expect(cmp).toBeGreaterThan(-1);
        expect(guard).toBeLessThan(cmp);
    });

    test('thông báo nói rõ là tài khoản Google', () => {
        // "Có lỗi xảy ra" thì người dùng không biết phải làm gì tiếp.
        expect(body).toMatch(/Google/);
    });
});

describe('buildFullState trả cờ isGoogleAccount', () => {
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'utils', 'userStateHelper.js'), 'utf8');

    test('là boolean, KHÔNG phải googleId thô', () => {
        // Client chỉ cần biết có mật khẩu hay không; lộ định danh Google ra là
        // thừa và không cần thiết.
        expect(src).toMatch(/isGoogleAccount: !!user\.googleId/);
        expect(src).not.toMatch(/^\s*googleId: user\.googleId/m);
    });
});
