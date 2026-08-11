/**
 * Enforcement: TIẾN TRÌNH NÀO PHỤC VỤ `index.html` THÌ PHẢI PHỤC VỤ LUÔN MỌI
 * ĐƯỜNG DẪN TUYỆT ĐỐI MÀ FRONTEND GỌI.
 *
 * Vì sao cần: frontend build ra gọi `fetch('/api/...')` — đường dẫn TƯƠNG ĐỐI
 * so với origin đang phục vụ nó. Lúc `vite dev` thì proxy trong `vite.config.js`
 * đẩy `/api` sang `localhost:5000` nên mọi thứ chạy. **Bản build không có proxy
 * nào cả.** Deploy frontend lên một host, backend lên host khác → 72 lời gọi
 * `/api/...` trong 29 file trỏ vào host của frontend → 404 sạch. App render
 * xong rồi đứng im, không một dòng lỗi nào ở server.
 *
 * Đây là bản sao của `SEC-admin.core-004` (admin panel hardcode
 * `http://localhost:5000`) — đã vá cho panel, nhưng site thứ hai là React
 * client thì không ai đi tìm. Cùng một khuôn lỗi, hai module, cách nhau một
 * đợt audit. Nên chốt bằng máy chứ không bằng trí nhớ.
 *
 * Cách vá đã chọn: backend phục vụ luôn `frontend/dist` → cùng origin → cả 72
 * literal đúng mà không phải sửa file nào bên frontend. Test này khoá lựa chọn
 * đó lại: gỡ phần phục vụ SPA đi là đỏ.
 *
 * Test thuần: đọc file nguồn, không nạp app, không DB, không HTTP.
 */
const fs = require('fs');
const path = require('path');

const SERVER_JS = path.join(__dirname, '..', 'server.js');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const FRONTEND_SRC = path.join(__dirname, '..', '..', 'frontend', 'src');

const serverSrc = fs.readFileSync(SERVER_JS, 'utf8');

/**
 * Miễn trừ có chủ ý. Key = prefix, value = lý do.
 * Thêm dòng vào đây phải kèm lý do — đó là toàn bộ giá trị của cơ chế này.
 */
const ALLOWLIST = {
    // Không có: mọi prefix frontend gọi hiện đều được backend phục vụ.
    // Nếu sau này frontend gọi sang một dịch vụ ngoài bằng đường dẫn tuyệt đối,
    // ghi vào đây kèm lý do vì sao nó KHÔNG cần cùng origin.
};

// ── Thu thập prefix mà backend phục vụ ────────────────────────────────────────

/** Prefix mount qua `app.use('/x', ...)` hoặc `app.get('/x', ...)`. */
function mountedPrefixes(src) {
    const out = new Set();
    const re = /app\.(?:use|get)\(\s*(['"`])(\/[a-zA-Z][a-zA-Z0-9_-]*)/g;
    let m;
    while ((m = re.exec(src)) !== null) out.add(m[2]);
    return out;
}

/** Prefix phục vụ tĩnh: mỗi thư mục con trong `backend/public` là một `/tên`. */
function staticPrefixes(dir) {
    const out = new Set();
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) out.add('/' + e.name);
    }
    return out;
}

// ── Thu thập đường dẫn tuyệt đối mà frontend gọi ──────────────────────────────

/**
 * CHỈ quét literal nằm trong `fetch(...)`. Đó đúng là khuôn lỗi: một lời gọi
 * mạng tới đường dẫn tuyệt đối cùng origin. Cố tình KHÔNG quét mọi literal bắt
 * đầu bằng `/`, vì phần lớn chúng là sub-path đưa cho `Http.get('/vocabulary')`
 * — thứ đã được `Http.baseURL` ghép `/api` vào trước, không phải lỗi.
 */
function fetchedPrefixes(dir) {
    const out = new Map();   // prefix -> file:line đầu tiên gặp
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|jsx)$/.test(e.name)) continue;
            if (/\.test\.(js|jsx)$/.test(e.name)) continue;   // test dùng URL giả
            const lines = fs.readFileSync(p, 'utf8').split('\n');
            lines.forEach((line, i) => {
                const re = /fetch\(\s*(['"`])(\/[a-zA-Z][a-zA-Z0-9_-]*)/g;
                let m;
                while ((m = re.exec(line)) !== null) {
                    if (!out.has(m[2])) {
                        out.set(m[2], `${path.relative(FRONTEND_SRC, p)}:${i + 1}`);
                    }
                }
            });
        }
    };
    walk(dir);
    return out;
}

describe('SPA serving — origin phục vụ index.html phải phục vụ luôn API', () => {

    test('server.js phục vụ thư mục build của frontend', () => {
        // Không khoá cứng tên biến, chỉ đòi: có tham chiếu tới frontend/dist VÀ
        // nó được đưa qua express.static.
        expect(serverSrc).toMatch(/['"`]frontend['"`]\s*,\s*['"`]dist['"`]|frontend[\/\\]dist/);
        expect(serverSrc).toMatch(/express\.static\(\s*(FRONTEND_DIST|DIST)/);
    });

    test('server.js có catch-all trả index.html cho SPA', () => {
        expect(serverSrc).toMatch(/app\.get\(\s*['"`]\*['"`]/);
        expect(serverSrc).toMatch(/sendFile\(/);
    });

    test('catch-all SPA phải đứng SAU handler 404 của /api', () => {
        // Đảo thứ tự này là catch-all nuốt mọi URL /api gõ sai và trả HTML cho
        // một lời gọi fetch — client parse HTML thành JSON rồi báo lỗi vô nghĩa.
        const api404 = serverSrc.indexOf("app.use('/api/*'");
        const spaCatchAll = serverSrc.search(/app\.get\(\s*['"`]\*['"`]/);
        expect(api404).toBeGreaterThan(-1);
        expect(spaCatchAll).toBeGreaterThan(-1);
        expect(spaCatchAll).toBeGreaterThan(api404);
    });

    test('catch-all KHÔNG nuốt đường dẫn có đuôi file', () => {
        // Bắt tất là một ảnh/audio thiếu trả HTML kèm 200 thay vì 404 — `<img>`
        // và `<audio>` hỏng lúc decode, mất sạch tín hiệu. Tệ nhất: nó che đúng
        // triệu chứng của DEPLOY-deployment-004 (ảnh upload mất sau redeploy).
        const catchAll = serverSrc.slice(serverSrc.search(/app\.get\(\s*['"`]\*['"`]/));
        expect(catchAll).toMatch(/path\.extname\(\s*req\.path\s*\)/);
        expect(catchAll).toMatch(/return next\(\)/);
    });

    test('mọi host ngoài mà bản build nạp đều phải có trong CSP', () => {
        // Vá từng directive một khi người dùng báo lỗi là cách làm sai: mỗi lần chỉ
        // lộ đúng tính năng vừa bấm trúng. Test này quét bản build và bắt cả những
        // host chưa ai bấm tới. Không có dist (CI chưa build) thì bỏ qua — không
        // giả vờ xanh.
        const DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
        if (!fs.existsSync(DIST)) return;

        // Host xuất hiện trong bundle dưới dạng CHỮ, không phải tài nguyên được nạp.
        // Mỗi dòng phải kèm lý do.
        const NOT_LOADED = {
            'www.w3.org': 'xmlns của SVG — không phải request',
            'react.dev': 'URL trong thông báo lỗi của React',
            'fontawesome.com': 'chuỗi bản quyền trong CSS',
            'translate.google.com.vn': 'link mở tab mới (điều hướng), không phải subresource',
        };

        const files = [];
        const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory()) walk(p);
                else if (/\.(js|css|html)$/.test(e.name)) files.push(p);
            }
        };
        walk(DIST);

        // PHẢI bỏ comment trước khi đối chiếu. Các directive ở đây có comment nhắc
        // tên host để giải thích vì sao chúng cần — nếu so khớp cả comment thì gỡ
        // host khỏi directive vẫn xanh, và test thành đồ trang trí. Đã dính đúng
        // bẫy này một lần lúc reverse-verify.
        const csp = serverSrc
            .slice(serverSrc.indexOf('contentSecurityPolicy'), serverSrc.indexOf('app.use(compression'))
            .replace(/^\s*\/\/.*$/gm, '');   // CHỈ dòng comment thuần — `/\/\/.*$/` cắt luôn `//` trong chính URL
        const missing = new Set();
        for (const f of files) {
            const text = fs.readFileSync(f, 'utf8');
            for (const m of text.matchAll(/https:\/\/([a-zA-Z0-9.-]+\.[a-z]{2,})/g)) {
                const host = m[1];
                if (NOT_LOADED[host]) continue;
                if (csp.includes(host)) continue;
                missing.add(host);
            }
        }
        expect([...missing]).toEqual([]);
    });

    test('CSP không cấp quyền cho host mà không ai nạp', () => {
        // Chiều NGƯỢC của test trên. Test kia bắt "nạp mà chưa cấp"; test này bắt
        // "cấp mà không nạp". Mỗi origin thừa trong `scriptSrc` là một nơi mà thẻ
        // <script src> chèn được vẫn tải mã về — và `cdn.jsdelivr.net` phục vụ mọi
        // gói npm/GitHub theo URL, nên đó không phải một khoản cấp hẹp. Nó nằm ngay
        // dưới lớp phòng thủ vừa dựng: 211 chỗ innerHTML đã escape + adminEscaping.
        const DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
        const ADMIN = path.join(__dirname, '..', 'public', 'admin');

        // Host được cấp trong CSP (bỏ dòng comment — xem ghi chú ở test trên).
        const csp = serverSrc
            .slice(serverSrc.indexOf('contentSecurityPolicy'), serverSrc.indexOf('app.use(compression'))
            .replace(/^\s*\/\/.*$/gm, '');
        const granted = new Set([...csp.matchAll(/https:\/\/([a-zA-Z0-9.*-]+\.[a-z]{2,})/g)].map(m => m[1]));

        // Host thực sự xuất hiện trong mã đã build + panel admin.
        const referenced = new Set();
        const scan = (dir) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) { scan(p); continue; }
                if (!/\.(js|css|html)$/.test(e.name)) continue;
                for (const m of fs.readFileSync(p, 'utf8').matchAll(/https:\/\/([a-zA-Z0-9.-]+\.[a-z]{2,})/g)) {
                    referenced.add(m[1]);
                }
            }
        };
        scan(DIST);
        scan(ADMIN);
        if (referenced.size === 0) return;   // chưa build → không kết luận được

        // Host mà nguồn dùng nằm ở DỮ LIỆU chứ không ở mã — quét source không thể
        // thấy. Mỗi dòng phải kèm lý do và cách kiểm lại.
        const DATA_DRIVEN = {
            'res.cloudinary.com': 'URL nằm trong DB, không trong mã: 699 URL ở toeic_question_sets.audioUrl + ảnh upload. Kiểm: db.toeic_question_sets.findOne({audioUrl:/cloudinary/})',
        };

        const dead = [...granted].filter(h => !referenced.has(h) && !DATA_DRIVEN[h]);
        expect(dead).toEqual([]);
    });

    test('CSP cho phép blob: nếu frontend tạo Object URL', () => {
        // Bộ dò host ở trên CHỈ quét chuỗi `https://...` trong bundle, nên nó
        // không bao giờ thấy `blob:` — URL đó do `URL.createObjectURL()` SINH RA
        // LÚC CHẠY, không tồn tại dưới dạng chuỗi tĩnh trong mã đã build.
        //
        // Đã trả giá thật: `/api/tts` stream audio/mpeg về, client bọc thành
        // Object URL rồi phát (api/tts.js). Thiếu `blob:` trong mediaSrc thì trình
        // duyệt chặn, TTS lặng lẽ rơi về giọng mặc định của hệ điều hành — chọn
        // giọng nào cũng nghe ra CÙNG MỘT giọng.
        const FE_SRC = path.join(__dirname, '..', '..', 'frontend', 'src');
        if (!fs.existsSync(FE_SRC)) return;

        let makesBlob = false;
        const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory()) { walk(p); continue; }
                if (!/\.(js|jsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
                if (/URL\.createObjectURL/.test(fs.readFileSync(p, 'utf8'))) makesBlob = true;
            }
        };
        walk(FE_SRC);
        if (!makesBlob) return;   // không tạo blob thì không cần khai

        const media = serverSrc.match(/mediaSrc:\s*\[([^\]]*)\]/);
        expect(media).not.toBeNull();
        expect(media[1]).toMatch(/["']blob:["']/);
    });

    test('CSP cho phép font dạng data: — FontAwesome nhúng woff2 base64', () => {
        // Thiếu `data:` ở fontSrc thì mọi icon thành ô vuông trống. `imgSrc` có
        // `data:` từ trước nên ẢNH vẫn chạy — lại một lệch nữa làm lỗi khó đọc.
        const font = serverSrc.match(/fontSrc:\s*\[([^\]]*)\]/);
        expect(font).not.toBeNull();
        expect(font[1]).toMatch(/["']data:["']/);
    });

    test('CSP phải khai báo mediaSrc cho Cloudinary', () => {
        // Hệ quả trực tiếp của việc backend phục vụ SPA: bản build giờ chạy DƯỚI
        // CSP của helmet, thứ mà `vite dev` không hề gửi. Thiếu `mediaSrc` thì media
        // rơi về `defaultSrc: 'self'` → trình duyệt chặn thẳng audio Cloudinary:
        // không request, không log, client chỉ báo "Không thể phát file audio".
        // `imgSrc` đã có `https:` nên ẢNH vẫn chạy — đó là lý do lỗi chỉ hiện ở audio
        // và rất dễ bị đọc nhầm thành hỏng file.
        expect(serverSrc).toMatch(/mediaSrc:\s*\[/);
        const media = serverSrc.match(/mediaSrc:\s*\[([^\]]*)\]/);
        expect(media[1]).toMatch(/res\.cloudinary\.com/);
    });

    test('mọi prefix frontend fetch() đều được backend phục vụ', () => {
        const served = new Set([...mountedPrefixes(serverSrc), ...staticPrefixes(PUBLIC_DIR)]);
        const requested = fetchedPrefixes(FRONTEND_SRC);

        const unserved = [];
        for (const [prefix, where] of requested) {
            if (served.has(prefix)) continue;
            if (ALLOWLIST[prefix]) continue;
            unserved.push(`${prefix}  (${where})`);
        }

        expect(requested.size).toBeGreaterThan(0);   // quét được thứ gì đó thật
        expect(unserved).toEqual([]);
    });

    // ── Self-check: chứng minh bộ dò còn dò được ──────────────────────────────

    test('self-check: bộ dò prefix bắt được đường dẫn không ai phục vụ', () => {
        const served = new Set(mountedPrefixes("app.use('/api/auth', r);"));
        expect(served.has('/api')).toBe(true);
        expect(served.has('/khong-ton-tai')).toBe(false);
    });

    test('self-check: chỉ bắt literal trong fetch(), không bắt sub-path của Http', () => {
        const re = /fetch\(\s*(['"`])(\/[a-zA-Z][a-zA-Z0-9_-]*)/g;
        expect(re.exec("await fetch('/api/auth/me')")[2]).toBe('/api');
        re.lastIndex = 0;
        expect(re.exec("Http.get('/vocabulary')")).toBeNull();
    });
});
