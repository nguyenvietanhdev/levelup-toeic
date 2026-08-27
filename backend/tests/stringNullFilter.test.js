/**
 * `String(null)` cho ra `"null"` — TRUTHY.
 *
 * Nên `arr.map(String).filter(Boolean)` KHÔNG lọc được null/undefined: chúng
 * biến thành chuỗi `"null"` / `"undefined"` rồi lọt qua bộ lọc.
 *
 * Đã gây ra hai lỗi thật:
 *   - `/admin/ai-usage` trả 500 ("Cast to ObjectId failed for value \"null\"")
 *     và cả tab Chi phí AI trắng. 95/201 log có `userId: null` vì là tác vụ
 *     HỆ THỐNG — không phải trường hợp hiếm.
 *   - `/admin/cloudinary/delete` gửi Cloudinary đi xoá một file tên "null".
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const R = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('String(null) là "null", không phải rỗng', () => {
    test('bản chất của lỗi', () => {
        expect(String(null)).toBe('null');
        expect(Boolean(String(null))).toBe(true);
        // Cách SAI: null lọt qua
        expect([null, 'x'].map(String).filter(Boolean)).toEqual(['null', 'x']);
        // Cách ĐÚNG: lọc trước rồi mới đổi chuỗi
        expect([null, 'x'].filter(Boolean).map(String)).toEqual(['x']);
    });
});

describe('ai-usage: lọc userId trước khi đổi chuỗi', () => {
    const src = R('routes', 'adminDefinitions.js');

    test('lọc TRƯỚC, `.map(String)` SAU', () => {
        const i = src.indexOf('const userIds = ');
        expect(i).toBeGreaterThan(-1);
        const dong = src.slice(i, src.indexOf(';', i));
        expect(dong).toMatch(/\.filter\(Boolean\)\.map\(String\)/);
        expect(dong).not.toMatch(/\.map\(r => String\(r\.userId\)\)/);
    });

    test('vẫn hiện "(system)" cho log không có userId', () => {
        // Log của tác vụ hệ thống là hợp lệ, không được bỏ đi.
        expect(src).toMatch(/'\(system\)'/);
    });
});

describe('cloudinary delete: không đoán mò id', () => {
    const src = R('routes', 'adminCloudinary.js');

    test('chỉ nhận chuỗi KHÔNG rỗng', () => {
        // Ở một route XOÁ thì gửi đi một id bịa là thứ tệ nhất.
        const i = src.indexOf('const publicIds = ');
        const dong = src.slice(i, src.indexOf(';', i));
        expect(dong).toMatch(/typeof x === 'string' && x\.trim\(\)/);
        expect(dong).not.toMatch(/\.map\(String\)\.filter\(Boolean\)/);
    });
});
