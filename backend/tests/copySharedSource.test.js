/**
 * Sao chép một bộ được chia sẻ về kho riêng.
 *
 * Đây là lối thoát khỏi vấn đề TTL: bộ gốc hết hạn thì bản sao vẫn còn.
 *
 * Ba chỗ dễ sai:
 *
 * 1. ĐẾM HẠN MỨC TRƯỚC KHI GHI. Ghi rồi mới phát hiện vượt hạn là để lại NỬA bộ
 *    từ trong kho, người dùng không biết thiếu từ nào — mà không có transaction
 *    nên không hoàn tác được.
 *
 * 2. BẢN SAO PHẢI MANG ownerEmail NGƯỜI GỌI. Chép xong mà vẫn ghi email chủ gốc
 *    thì bản sao không phải của mình: bộ gốc hết hạn là mất cả hai.
 *
 * 3. HẠN MỚI, KHÔNG KẾ THỪA. Kế thừa `expiresAt` của bản gốc thì bản sao chết
 *    cùng lúc với bản gốc — chép xong cũng vô nghĩa.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const controller = fs
    .readFileSync(path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const routes = fs
    .readFileSync(path.join(__dirname, '..', 'routes', 'uploadRoutes.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

function body() {
    const start = controller.indexOf('exports.copySharedSource');
    expect(start).toBeGreaterThan(-1);
    const next = controller.indexOf('exports.', start + 10);
    return controller.slice(start, next === -1 ? undefined : next);
}

describe('copySharedSource', () => {

    test('đếm hạn mức TRƯỚC khi ghi', () => {
        const b = body();
        const countAt = b.indexOf('countDocuments({ ownerEmail: me })');
        const writeAt = b.indexOf('bulkWrite');
        expect(countAt).toBeGreaterThan(-1);
        expect(writeAt).toBeGreaterThan(countAt);   // đảo lại = ghi nửa chừng rồi mới báo lỗi
    });

    test('vượt hạn thì trả limitReached và KHÔNG ghi gì', () => {
        const b = body();
        expect(b).toMatch(/limitReached:\s*true/);
        // `return` ngay tại nhánh vượt hạn — không rơi xuống bulkWrite.
        const limitAt = b.indexOf('limitReached');
        const writeAt = b.indexOf('bulkWrite');
        expect(b.slice(limitAt, writeAt)).toMatch(/return res\.status\(400\)|\}\);/);
    });

    test('chỉ tính từ THỰC SỰ mới, không đếm phần chép đè', () => {
        // Chép lại bộ đã có thì phần trùng không làm tăng số từ; tính cả vào là
        // chặn oan người dùng còn thừa chỗ.
        expect(body()).toMatch(/willAdd = words\.length - existing/);
    });

    test('bản sao mang ownerEmail NGƯỜI GỌI, không phải chủ gốc', () => {
        const b = body();
        expect(b).toMatch(/ownerEmail:\s*me,\s*expiresAt/);
        // Và không được ghi email chủ gốc vào bản sao.
        expect(b).not.toMatch(/ownerEmail:\s*grant\.ownerEmail,\s*source:\s*target/);
    });

    test('hạn MỚI, không kế thừa expiresAt của bản gốc', () => {
        const b = body();
        expect(b).toMatch(/expiresAt = new Date\(Date\.now\(\) \+ DEFAULT_RETENTION_DAYS/);
        expect(b).not.toMatch(/expiresAt:\s*w\.expiresAt/);
    });

    test('tra grant TRƯỚC khi đọc từ', () => {
        const b = body();
        expect(b.indexOf('VocabShare.findOne')).toBeLessThan(b.indexOf('UserUpload.find('));
    });

    test('không có grant thì 403', () => {
        expect(body()).toMatch(/status\(403\)/);
    });

    test('bộ đã hết hạn (0 từ) thì 404, không tạo bộ rỗng', () => {
        expect(body()).toMatch(/words\.length === 0/);
        expect(body()).toMatch(/status\(404\)/);
    });

    test('trùng tên thì đổi thành <source>-copy, không trộn vào bộ sẵn có', () => {
        expect(body()).toMatch(/\$\{source\}-copy/);
    });

    test('ghi bằng upsert theo đúng khoá (ownerEmail, source, en)', () => {
        // Trùng từ thì đè, không nhân bản.
        expect(body()).toMatch(/filter:\s*\{\s*ownerEmail:\s*me,\s*source:\s*target,\s*en:\s*w\.en\s*\}/);
        expect(body()).toMatch(/upsert:\s*true/);
    });

    test('route có protect', () => {
        expect(routes).toMatch(/router\.post\(\s*['"]\/shared-vocabulary\/:ownerEmail\/:source\/copy['"]\s*,\s*protect\s*,\s*copySharedSource/);
    });

    test('tự kiểm: đọc được thân hàm thật', () => {
        expect(body().length).toBeGreaterThan(1000);
        expect(body()).toMatch(/bulkWrite/);
    });
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
