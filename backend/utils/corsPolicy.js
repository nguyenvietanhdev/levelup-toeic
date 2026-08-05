/**
 * Chính sách CORS — tách khỏi server.js để test được mà không phải nạp cả app.
 *
 * Luật, theo thứ tự:
 *   1. Không có header `Origin` → cho qua. (GET/HEAD same-origin không gửi header
 *      này; công cụ dòng lệnh cũng vậy.)
 *   2. `Origin` TRÙNG origin của chính request → cho qua, luôn luôn, bất kể domain.
 *      Backend phục vụ luôn bản build frontend nên nó gọi chính nó — bắt người
 *      deploy khai lại domain của chính mình vào env là một bước thừa mà quên là
 *      hỏng, và hỏng im lặng: GET vẫn chạy nên trang load đẹp, chỉ POST mới chết.
 *   3. `Origin` nằm trong `CORS_ORIGIN` → cho qua. (Dành cho khi tách frontend
 *      sang host riêng.)
 *   4. Còn lại → chặn.
 *
 * Luật 2 là bản vá cho một lỗi đã ra tới production: trình duyệt CÓ gửi `Origin`
 * cho mọi method != GET/HEAD kể cả same-origin, nên `POST /api/auth/login` từ
 * chính trang của mình vẫn bị so với danh sách mặc định toàn localhost rồi chặn.
 */

/** Origin mặc định cho môi trường dev khi không khai `CORS_ORIGIN`. */
const DEV_ORIGINS = [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:5500', 'http://127.0.0.1:5500',
    'http://localhost:5173', 'http://127.0.0.1:5173',
];

/**
 * Origin của chính request. Dùng `req.protocol`, thứ đã tôn trọng
 * `X-Forwarded-Proto` nhờ `app.set('trust proxy', ...)` — sau reverse proxy của
 * Render thì kết nối tới app là http trong khi trình duyệt gửi Origin https, so
 * chuỗi thô sẽ lệch scheme và chặn nhầm chính mình.
 */
function selfOrigin(req) {
    const host = req.get('host');
    return host ? `${req.protocol}://${host}` : null;
}

function allowedFromEnv(env) {
    if (!env.CORS_ORIGIN) return DEV_ORIGINS;
    return env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
}

/**
 * Delegate theo dạng `cors(delegate)`: nhận `req` chứ không chỉ chuỗi origin —
 * cần `req` mới biết được origin của chính app.
 *
 * @param {object} req
 * @param {(err: Error|null, opts?: object) => void} callback
 * @param {object} [env] tiêm cho test; mặc định `process.env`
 */
function corsOptionsDelegate(req, callback, env = process.env) {
    const base = { credentials: true };
    const origin = req.headers.origin;

    if (!origin) return callback(null, { ...base, origin: true });
    if (origin === selfOrigin(req)) return callback(null, { ...base, origin: true });
    if (allowedFromEnv(env).includes(origin)) return callback(null, { ...base, origin: true });

    callback(new Error(`CORS: origin ${origin} not allowed`));
}

module.exports = { corsOptionsDelegate, selfOrigin, DEV_ORIGINS };
