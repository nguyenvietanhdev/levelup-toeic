/**
 * Chốt: admin panel không được ghi cứng host trong URL gọi API.
 *
 * Vì sao cần: `state.js` từng có `const API_URL = 'http://localhost:5000/api'`,
 * cộng 2 chỗ `fetch("http://localhost:5000/health")`. Panel do chính server API
 * phục vụ, nên khi deploy, `localhost:5000` trỏ về máy của NGƯỜI ĐANG MỞ TRANG.
 * Hậu quả không phải một lỗi 404 dễ thấy: `loadDashboard()` bắt lỗi rồi âm thầm
 * chuyển sang "offline mode", render từ file JSON tĩnh trong repo. Admin ngồi
 * xoá từ vựng trên dữ liệu seed mà tưởng đang thao tác với production. Thêm nữa,
 * `http://` trong trang `https://` bị trình duyệt chặn vì mixed content.
 *
 * Lỗi này không thể phát hiện khi dev (localhost luôn đúng) và chỉ lộ ra sau khi
 * deploy — đúng loại phải chặn bằng máy. Xem SEC-admin.core-004.
 */
const fs = require('fs');
const path = require('path');

const ADMIN_JS = path.join(__dirname, '..', 'public', 'admin', 'js');

/** Mọi file .js trong admin panel, trừ vendor. */
function adminScripts(dir = ADMIN_JS, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'vendor') adminScripts(full, acc);
        } else if (entry.name.endsWith('.js')) {
            acc.push(full);
        }
    }
    return acc;
}

/** Bỏ comment để không báo động ở phần giải thích lý do. */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = adminScripts();

describe('admin panel — URL API không ghi cứng host', () => {
    test('quét được các file panel (chốt chính máy quét)', () => {
        expect(files.length).toBeGreaterThan(15);
    });

    test('không file nào còn "localhost" trong mã thực thi', () => {
        const offenders = files
            .filter(f => /localhost/.test(stripComments(fs.readFileSync(f, 'utf8'))))
            .map(f => path.relative(ADMIN_JS, f));
        expect(offenders).toEqual([]);
    });

    test('không có fetch() tới URL tuyệt đối http(s)://', () => {
        const offenders = [];
        for (const f of files) {
            const code = stripComments(fs.readFileSync(f, 'utf8'));
            // fetch("http://…") hoặc fetch(`https://…`) — chuỗi mở đầu bằng scheme.
            if (/fetch\(\s*[`'"]https?:\/\//.test(code)) {
                offenders.push(path.relative(ADMIN_JS, f));
            }
        }
        expect(offenders).toEqual([]);
    });

    test('API_URL dựng từ location.origin', () => {
        const state = fs.readFileSync(path.join(ADMIN_JS, 'core', 'state.js'), 'utf8');
        expect(stripComments(state)).toMatch(/const API_URL\s*=\s*`\$\{location\.origin\}\/api`/);
    });

    test('máy dò còn hoạt động', () => {
        // Nếu stripComments hoặc regex hỏng, các test trên xanh một cách vô nghĩa.
        expect(/localhost/.test(stripComments('const x = "http://localhost:5000";'))).toBe(true);
        expect(/localhost/.test(stripComments('// nói về localhost trong comment'))).toBe(false);
        expect(/fetch\(\s*[`'"]https?:\/\//.test('fetch("http://a/b")')).toBe(true);
        expect(/fetch\(\s*[`'"]https?:\/\//.test('fetch("/health")')).toBe(false);
    });
});
