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

describe('googleId một mình KHÔNG đủ để kết luận "không có mật khẩu"', () => {
    test('tài khoản TẠO bằng Google vẫn CÓ password (chuỗi rác)', () => {
        // Đây là lý do guard `!user.password` không bao giờ chạy: đăng ký qua
        // Google gán randomBytes(24) để qua validate.
        const u = new User({
            username: 'gg', email: 'gg@x.com', googleId: 'sub-1',
            password: require('crypto').randomBytes(24).toString('hex'),
            hasUsablePassword: false,
        });
        expect(!!u.password).toBe(true);
        expect(!u.password).toBe(false);      // guard cũ KHÔNG kích hoạt
        expect(u.hasUsablePassword).toBe(false); // cờ mới thì có
    });

    test('đăng ký thường rồi LIÊN KẾT Google vẫn đổi được mật khẩu', () => {
        // Trường hợp dễ làm hỏng nhất: chặn theo googleId là cướp mất quyền đổi
        // mật khẩu của người có mật khẩu THẬT.
        const u = new User({
            username: 'thuong', email: 'thuong@x.com',
            password: 'matkhauthat', googleId: 'sub-2',
        });
        expect(u.googleId).toBeTruthy();
        expect(u.hasUsablePassword).toBe(true); // mặc định — không bị chặn
    });

    test('mặc định là true — tài khoản thường không bị chặn nhầm', () => {
        const u = new User({ username: 'a', email: 'a@x.com', password: 'abc123' });
        expect(u.hasUsablePassword).toBe(true);
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

    test('chặn theo hasUsablePassword, KHÔNG theo googleId', () => {
        // Chặn theo googleId là cướp quyền đổi mật khẩu của người đăng ký
        // email+mật khẩu trước rồi mới liên kết Google.
        expect(body).toMatch(/if \(user\.hasUsablePassword === false\)/);
        expect(body).not.toMatch(/if \(user\.googleId\)/);
    });

    test('vẫn giữ chặn !user.password phòng xa', () => {
        expect(body).toMatch(/if \(!user\.password\)/);
        expect(body).toMatch(/status\(400\)/);
    });

    test('CẢ HAI chặn nằm TRƯỚC comparePassword', () => {
        // Sau thì vô nghĩa — bcrypt đã ném lỗi mất rồi.
        const flag = body.indexOf('user.hasUsablePassword === false');
        const guard = body.indexOf('if (!user.password)');
        const cmp = body.indexOf('user.comparePassword(');
        expect(cmp).toBeGreaterThan(-1);
        expect(flag).toBeGreaterThan(-1);
        expect(flag).toBeLessThan(cmp);
        expect(guard).toBeLessThan(cmp);
    });

    test('thông báo chỉ ĐÚNG lối thoát (Quên mật khẩu)', () => {
        // "Không đổi được" mà không nói làm gì tiếp thì người dùng kẹt.
        expect(body).toMatch(/Google/);
        expect(body).toMatch(/Quên mật khẩu/);
    });
});

describe('đặt lại mật khẩu mở khoá form đổi mật khẩu', () => {
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'controllers', 'authController.js'), 'utf8');

    test('resetPassword bật lại hasUsablePassword', () => {
        // Đây là lối thoát ta CHỈ cho người dùng; không bật lại thì họ đặt mật
        // khẩu xong vẫn thấy ghi chú "chưa có mật khẩu" — như thể không ăn thua.
        const i = src.indexOf('const resetPassword =');
        const body = src.slice(i, src.indexOf('\nconst ', i + 10));
        expect(body).toMatch(/user\.hasUsablePassword = true/);
    });

    test('tài khoản tạo bằng Google được đánh dấu false lúc tạo', () => {
        const i = src.indexOf('const randomPassword');
        const body = src.slice(i, i + 900);
        expect(body).toMatch(/hasUsablePassword: false/);
    });
});

describe('buildFullState trả cờ isGoogleAccount', () => {
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'utils', 'userStateHelper.js'), 'utf8');

    test('là boolean, KHÔNG phải googleId thô', () => {
        // Client chỉ cần biết có đổi được mật khẩu hay không; lộ định danh
        // Google ra là thừa.
        expect(src).toMatch(/isGoogleAccount: !!user\.googleId/);
        expect(src).not.toMatch(/^\s*googleId: user\.googleId/m);
    });

    test('trả cả hasUsablePassword — đây mới là cờ quyết định', () => {
        expect(src).toMatch(/hasUsablePassword: user\.hasUsablePassword !== false/);
    });

    test('!== false chứ không phải !!  — user cũ thiếu trường vẫn là true', () => {
        // Tài khoản có trước khi thêm trường thì `undefined`; `!!undefined` cho
        // false → chặn nhầm toàn bộ người dùng cũ khỏi việc đổi mật khẩu.
        expect(src).not.toMatch(/hasUsablePassword: !!user\.hasUsablePassword/);
    });
});
