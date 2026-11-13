/**
 * Định dạng email.
 *
 * Chỗ dễ hỏng: chặn oan email thật (đuôi tên miền dài, dấu `+`) → người dùng không đăng ký được
 * mà không hiểu vì sao; hoặc lỏng tới mức nhận chuỗi có khoảng trắng / thiếu @.
 */
const { EMAIL_RE } = require('../utils/email');

test.each([
    'nvietanh093@gmail.com',
    'ten+abc@gmail.com',
    'first.last@company.online',
    'a@b.info',
    'support@school.edu.vn',
    'user_name-1@sub.domain.email',
])('nhận email thật: %s', (e) => expect(EMAIL_RE.test(e)).toBe(true));

test.each([
    'khong-co-a-cong.com',
    'a@b',
    'a b@gmail.com',
    'a@@gmail.com',
    'a@gmail.c',
    'a@gmail.123',
    '@gmail.com',
    'a@.com',
])('từ chối: %s', (e) => expect(EMAIL_RE.test(e)).toBe(false));

test('User và chia sẻ bộ từ dùng chung một quy tắc', () => {
    const User = require('../models/User');
    const { EMAIL_RE: reShare } = require('../models/VocabShare');
    expect(reShare).toBe(EMAIL_RE);
    expect(User.schema.path('email').validators.some((v) => v.regexp === EMAIL_RE)).toBe(true);
});
