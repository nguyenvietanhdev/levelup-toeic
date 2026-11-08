/**
 * Mã thoát của server.
 *
 * Chỗ dễ hỏng: sập vì lỗi chưa bắt mà vẫn thoát 0 = báo nền tảng "tắt bình thường", nên Render
 * không coi là sự cố. Còn tắt theo lệnh (SIGTERM lúc deploy hoặc cho ngủ) thì phải là 0.
 */
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

describe('mã thoát khi tắt', () => {
    test('lỗi chưa bắt thì thoát 1', () => {
        expect(server).toMatch(/shutdown\('unhandledRejection', 1\)/);
        expect(server).toMatch(/shutdown\('uncaughtException', 1\)/);
    });
    test('được bảo tắt thì thoát 0, và thoát đúng mã được truyền vào', () => {
        expect(server).toMatch(/process\.on\('SIGTERM', \(\) => shutdown\('SIGTERM'\)\)/);
        expect(server).toMatch(/async function shutdown\(signal, maThoat = 0\)/);
        expect(server).toMatch(/process\.exit\(maThoat\);/);
        expect(server).not.toMatch(/process\.exit\(0\);/);
    });
    test('lỗi thứ hai trong lúc đang tắt không chạy tắt lại từ đầu', () => {
        expect(server).toMatch(/if \(dangTat\) return;/);
    });
});
