/**
 * Enforcement repo-wide: MỌI route GHI (`post`/`put`/`patch`/`delete`) trong
 * `backend/routes/*.js` phải có guard, hoặc phải nằm trong ALLOWLIST kèm lý do.
 *
 * Vì sao cần: cùng một lỗi đã xuất hiện ở 3 router độc lập, mỗi lần đều là
 * "router này quên làm cái mà 4 router anh em của nó đều làm":
 *   - `vocabulary.js` — 11 route ghi để trần, gồm `DELETE /all` xoá sạch kho từ
 *     vựng và `POST /` là nguồn của một chuỗi XSS vào phiên admin;
 *   - `ai.js` — 6 route POST ẩn danh gọi nhà cung cấp AI TRẢ TIỀN theo token;
 *   - `activity.js` — `DELETE /` xoá ẩn danh chính nhật ký dùng để quy trách nhiệm.
 * Không có cái nào là quyết định có chủ ý; cả ba chỉ là thiếu sót. Trí nhớ đã
 * chứng minh là không đủ, nên chốt bằng máy.
 *
 * ALLOWLIST là cơ chế chính của test này: miễn trừ phải được viết ra và kèm lý
 * do, nên nó là một hành động có ý thức chứ không phải một chỗ bị bỏ quên.
 *
 * Test thuần: đọc file nguồn, không nạp app, không DB, không HTTP.
 */
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');
const MUTATING = /^router\.(post|put|patch|delete)\(\s*(['"`])(.*?)\2/;
const GUARD = /\bprotect\b|\bauthorize\s*\(|\brequireLevel\s*\(|\.\.\.admin\b|\badmin\s*,/;

/**
 * Miễn trừ có chủ ý. Key = `<file>:<METHOD> <path>`.
 * Thêm dòng vào đây phải kèm lý do — đó là toàn bộ giá trị của cơ chế này.
 */
const ALLOWLIST = {
    // Cổng đăng nhập/đăng ký: bản chất là public. Mỗi route đều có rate limiter
    // riêng (loginLimiter / adminLoginLimiter / otpLimiter / registerLimiter).
    'auth.js:POST /login': 'public by nature — loginLimiter',
    'auth.js:POST /google': 'public by nature — loginLimiter',
    'auth.js:POST /admin/login': 'public by nature — adminLoginLimiter',
    'auth.js:POST /check-lock': 'public by nature — checkLockLimiter',
    'auth.js:POST /send-register-otp': 'public by nature — registerLimiter',
    'auth.js:POST /verify-register-otp': 'public by nature — otpLimiter',
    'auth.js:POST /register': 'public by nature — registerLimiter',
    'auth.js:POST /forgot-password': 'public by nature — otpLimiter',
    'auth.js:POST /reset-password': 'public by nature — otpLimiter',

    // Người chưa đăng nhập vẫn gửi được góp ý — ghi rõ ngay trong routes/reports.js.
    'reports.js:POST /guest': 'unauthenticated fallback, có chủ ý',

    // (routes/test.js đã bị xoá — SEC-be.admin-api-001/-004/-005. Ba mục miễn trừ
    //  của nó biến mất cùng file, đúng như test "ALLOWLIST không có mục thừa" ép.)
};

/** Mọi route ghi khai báo trong routes/*.js, kèm cờ đã có guard hay chưa. */
function collectWriteRoutes() {
    const out = [];
    for (const file of fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
        // `router.use(protect)` phủ toàn bộ router bên dưới nó.
        const blanket = /router\.use\(\s*protect/.test(src);
        for (const line of src.split('\n')) {
            const m = line.match(MUTATING);
            if (!m) continue;
            out.push({
                key: `${file}:${m[1].toUpperCase()} ${m[3]}`,
                guarded: blanket || GUARD.test(line),
            });
        }
    }
    return out;
}

describe('routes/* — mọi route ghi phải có guard', () => {
    const routes = collectWriteRoutes();

    test('quét được một lượng route hợp lý (chốt chính cái máy quét)', () => {
        // Nếu regex hỏng, mảng rỗng và mọi test dưới sẽ xanh một cách vô nghĩa.
        expect(routes.length).toBeGreaterThan(60);
    });

    test('không route ghi nào vừa thiếu guard vừa không nằm trong ALLOWLIST', () => {
        const offenders = routes
            .filter(r => !r.guarded && !(r.key in ALLOWLIST))
            .map(r => r.key);
        expect(offenders).toEqual([]);
    });

    test('ALLOWLIST không có mục thừa — route đã guard thì phải gỡ khỏi danh sách', () => {
        const byKey = new Map(routes.map(r => [r.key, r]));
        const stale = Object.keys(ALLOWLIST).filter(k => !byKey.has(k) || byKey.get(k).guarded);
        expect(stale).toEqual([]);
    });

    test('mọi miễn trừ đều có lý do bằng chữ', () => {
        const empty = Object.entries(ALLOWLIST)
            .filter(([, why]) => !why || why.trim().length < 10)
            .map(([k]) => k);
        expect(empty).toEqual([]);
    });
});
