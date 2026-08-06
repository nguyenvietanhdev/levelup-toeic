/**
 * Enforcement: MỌI BIẾN MÔI TRƯỜNG CODE ĐỌC PHẢI CÓ TRONG `.env.example`.
 *
 * Vì sao cần: đây là nguyên nhân phổ biến nhất của "chạy được ở máy tôi". Máy dev
 * có `.env` đầy đủ vì nó lớn lên cùng dự án; người deploy chỉ có `.env.example`.
 * Biến nào thiếu ở đó thì hoặc app chết lúc khởi động, hoặc — tệ hơn — nó im lặng
 * rơi về giá trị mặc định và một tính năng hỏng mà không ai biết.
 *
 * Đã xảy ra thật trong dự án này, cả hai kiểu:
 *   - `CORS_ORIGIN` không có trong example → mặc định chỉ cho localhost → frontend
 *     đã deploy bị chặn CORS, server log nhìn hoàn toàn bình thường.
 *   - `REDIS_URL` không có → queue lặng lẽ chạy chế độ fallback, email degrade mà
 *     không một dòng lỗi.
 *   - `LOG_TO_FILE` thì do CHÍNH bản vá DEPLOY-012 thêm vào rồi quên ghi lại.
 *
 * Cái cuối là lý do phải chốt bằng máy: người sửa hợp đồng env cũng chính là người
 * làm rách nó.
 *
 * Test thuần: đọc file nguồn, không nạp app, không DB, không HTTP.
 */
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const EXAMPLE = path.join(BACKEND, '.env.example');

/**
 * Biến tra CỨU GIÁN TIẾP (`process.env[cfg.envKey]`) — bộ dò tĩnh không thấy được,
 * nên khai ở đây kèm nơi dùng.
 */
const INDIRECT = {
    DEEPSEEK_API_KEY: 'services/aiProviders.js:46 — tra qua envKey',
    GEMINI_API_KEY:   'services/aiProviders.js:60 — tra qua envKey',
    // Đọc qua tham số `env` tiêm vào `corsOptionsDelegate(req, cb, env)` — tách ra
    // để test chính sách CORS mà không phải nạp cả app. Kiểm: utils/corsPolicy.js
    // hàm `allowedFromEnv`.
    CORS_ORIGIN: 'utils/corsPolicy.js — đọc qua tham số env tiêm vào, không qua process.env trực tiếp',
};

/** Biến chỉ dùng trong `scripts/` chạy tay, không thuộc hợp đồng deploy. */
const SCRIPT_ONLY = {};

function documented() {
    const out = new Set();
    for (const line of fs.readFileSync(EXAMPLE, 'utf8').split('\n')) {
        const m = /^([A-Z_][A-Z0-9_]*)=/.exec(line);
        if (m) out.add(m[1]);
    }
    return out;
}

/** Quét biến env code THẬT SỰ đọc: cả `process.env.X` lẫn destructuring. */
function used(dir, { includeScripts }) {
    const out = new Map();   // NAME -> file:line
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (['node_modules', 'tests', 'public'].includes(e.name)) continue;
            if (!includeScripts && e.name === 'scripts') continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!e.name.endsWith('.js')) continue;
            const rel = path.relative(BACKEND, p).replace(/\\/g, '/');
            const lines = fs.readFileSync(p, 'utf8').split('\n');

            lines.forEach((line, i) => {
                if (/^\s*\/\//.test(line)) return;   // comment nhắc tên biến — không phải chỗ đọc
                for (const m of line.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
                    if (!out.has(m[1])) out.set(m[1], `${rel}:${i + 1}`);
                }
            });

            // Destructuring: `const { A, B } = process.env;` — có thể trải nhiều dòng.
            // utils/cloudinary.js lấy CLOUDINARY_API_KEY/_SECRET đúng kiểu này, và
            // bộ dò chỉ bắt `process.env.X` sẽ bỏ sót hoàn toàn.
            const whole = lines.join('\n');
            for (const m of whole.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*process\.env/g)) {
                for (const raw of m[1].split(',')) {
                    const name = raw.split(':')[0].trim();
                    if (/^[A-Z_][A-Z0-9_]*$/.test(name) && !out.has(name)) out.set(name, rel);
                }
            }
        }
    };
    walk(dir);
    return out;
}

describe('Hợp đồng env — .env.example phải khớp code', () => {

    test('mọi biến code đọc đều có trong .env.example', () => {
        const doc = documented();
        const missing = [];
        for (const [name, where] of used(BACKEND, { includeScripts: false })) {
            if (doc.has(name) || SCRIPT_ONLY[name]) continue;
            missing.push(`${name}  (${where})`);
        }
        expect(missing).toEqual([]);
    });

    test('.env.example không khai biến không ai đọc', () => {
        // Chiều ngược: config chết. Người sau đặt giá trị rồi ngồi thắc mắc vì sao
        // không có gì xảy ra.
        const all = used(BACKEND, { includeScripts: true });
        const dead = [...documented()].filter(n => !all.has(n) && !INDIRECT[n]);
        expect(dead).toEqual([]);
    });

    test('JWT_EXPIRE trong example không mâu thuẫn mặc định của code', () => {
        // `models/User.js` hạ mặc định xuống 12h có chủ ý. Ví dụ để `7d` là tài liệu
        // lặng lẽ khôi phục lại thứ mà bản vá kia sinh ra để bỏ — người deploy copy
        // example là mất bản vá mà không biết.
        const userSrc = fs.readFileSync(path.join(BACKEND, 'models', 'User.js'), 'utf8');
        const codeDefault = /DEFAULT_JWT_EXPIRE\s*=\s*['"]([^'"]+)['"]/.exec(userSrc);
        const exampleVal = /^JWT_EXPIRE=(.*)$/m.exec(fs.readFileSync(EXAMPLE, 'utf8'));
        expect(codeDefault).not.toBeNull();
        expect(exampleVal).not.toBeNull();
        expect(exampleVal[1].trim()).toBe(codeDefault[1]);
    });

    test('biến VITE_ của frontend đều có trong frontend/.env.example', () => {
        // Biến `VITE_*` được thay THẲNG VÀO MÃ lúc `vite build`, không đọc lúc chạy.
        // `frontend/.env` nằm trong .gitignore nên máy build của platform KHÔNG có
        // nó — thiếu khai trên platform là biến thành `undefined` ngay trong bundle.
        //
        // Đã xảy ra thật: `VITE_GOOGLE_CLIENT_ID` không được đặt trên Render, và
        // `GoogleSignInButton.jsx:56` có `if (!CLIENT_ID) return null` nên nút
        // "Đăng nhập bằng Google" BIẾN MẤT không một dòng lỗi. Build xanh, deploy
        // xanh, tính năng không còn.
        const FE = path.join(BACKEND, '..', 'frontend');
        const example = fs.readFileSync(path.join(FE, '.env.example'), 'utf8');
        const documented = new Set(
            example.split('\n').map(l => /^(VITE_[A-Z0-9_]*)=/.exec(l)?.[1]).filter(Boolean)
        );

        const used = new Map();
        const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory()) { walk(p); continue; }
                if (!/\.(js|jsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
                const rel = path.relative(FE, p).replace(/\\/g, '/');
                fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
                    if (/^\s*\/\//.test(line)) return;
                    for (const m of line.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]*)/g)) {
                        if (!used.has(m[1])) used.set(m[1], `${rel}:${i + 1}`);
                    }
                });
            }
        };
        walk(path.join(FE, 'src'));

        const missing = [...used].filter(([n]) => !documented.has(n)).map(([n, w]) => `${n}  (${w})`);
        expect(missing).toEqual([]);

        // Chiều ngược: khai mà không ai đọc → người deploy đặt giá trị rồi thắc mắc
        // vì sao không có tác dụng.
        const dead = [...documented].filter(n => !used.has(n));
        expect(dead).toEqual([]);
    });

    test('self-check: bộ dò thấy được cả hai cách đọc env', () => {
        const dir = path.join(require('os').tmpdir(), 'envcontract-selfcheck');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'a.js'),
            "const x = process.env.TRUC_TIEP;\nconst { PHA_HUY, MOT_KHAC } = process.env;\n// process.env.TRONG_COMMENT\n");
        const found = used(dir, { includeScripts: true });
        expect([...found.keys()].sort()).toEqual(['MOT_KHAC', 'PHA_HUY', 'TRUC_TIEP']);
        expect(found.has('TRONG_COMMENT')).toBe(false);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
