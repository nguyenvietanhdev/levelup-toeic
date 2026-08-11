/**
 * nodemon phải theo dõi MỌI thư mục mã nguồn chạy trong tiến trình server.
 *
 * Lỗi đã gặp: `nodemon.json` liệt kê 7 thư mục cần theo dõi và bỏ sót `models/`
 * — 42 file. Sửa enum của PracticeSession, chạy test xanh, commit... rồi vẫn
 * nhận `400 "pronunciation is not a valid enum value"` trên trình duyệt, vì
 * server chưa hề nạp lại. Không có dấu hiệu nào: nodemon không log gì, code
 * trên đĩa đúng, test đọc file từ đĩa nên cũng xanh. Chỉ có tiến trình đang
 * chạy là còn giữ bản cũ.
 *
 * Đây là SYS-001 lần thứ năm: một danh sách phải cập nhật bằng tay song song
 * với thực tế, và đã tụt lại. Cách đóng: theo dõi thư mục gốc rồi LOẠI TRỪ thứ
 * không cần — danh sách loại trừ sai thì chỉ thừa restart, còn danh sách cho
 * phép sai thì hỏng im lặng.
 */
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(BACKEND, 'nodemon.json'), 'utf8'));

/** Thư mục có mã chạy trong tiến trình server (không phải test/script rời). */
function runtimeCodeDirs() {
    return fs.readdirSync(BACKEND, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .filter(name => !['node_modules', 'tests', 'scripts', 'public', 'data',
                          'uploads', 'coverage', '.git'].includes(name))
        .filter(name => {
            // Chỉ tính thư mục thực sự chứa .js
            const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).some(e =>
                e.isFile() ? e.name.endsWith('.js')
                           : walk(path.join(dir, e.name)));
            try { return walk(path.join(BACKEND, name)); } catch { return false; }
        });
}

/** nodemon có theo dõi đường dẫn này không (kể cả qua watch thư mục gốc)? */
function isWatched(dirName) {
    return cfg.watch.some(w => {
        const n = w.replace(/\/$/, '');
        return n === '.' || n === dirName || n.startsWith(dirName + '/');
    });
}

describe('nodemon.json — theo dõi đủ mã nguồn', () => {

    test('có thư mục mã nguồn để kiểm — rỗng thì test này vô nghĩa', () => {
        expect(runtimeCodeDirs().length).toBeGreaterThan(5);
    });

    test('MỌI thư mục mã chạy lúc runtime đều được theo dõi', () => {
        const missed = runtimeCodeDirs().filter(d => !isWatched(d));
        // Thiếu một thư mục ở đây = sửa file trong đó mà server không nạp lại,
        // và không có dấu hiệu gì báo cho người sửa biết.
        expect(missed).toEqual([]);
    });

    test('models/ được theo dõi — chính là chỗ đã bị bỏ sót', () => {
        expect(fs.existsSync(path.join(BACKEND, 'models'))).toBe(true);
        expect(isWatched('models')).toBe(true);
    });

    test('không theo dõi node_modules — restart vô tận', () => {
        expect(cfg.ignore).toContain('node_modules/');
    });

    test('bỏ qua data/ — file bị GHI lúc chạy, theo dõi là restart vòng lặp', () => {
        // backend/data/activity-logs.json được ghi trong lúc server chạy.
        expect(cfg.ignore.some(i => i.replace(/\/$/, '') === 'data')).toBe(true);
    });

    test('tự kiểm: cấu hình kiểu danh sách cho phép thiếu models PHẢI bị bắt', () => {
        // Không có case này thì isWatched() sai hoàn toàn vẫn cho test xanh.
        const old = { watch: ['server.js', 'routes/', 'controllers/', 'utils/'] };
        const watchedBy = (c, d) => c.watch.some(w => {
            const n = w.replace(/\/$/, '');
            return n === '.' || n === d || n.startsWith(d + '/');
        });
        expect(watchedBy(old, 'models')).toBe(false);
        expect(watchedBy(old, 'routes')).toBe(true);
    });
});
