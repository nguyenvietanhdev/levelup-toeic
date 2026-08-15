require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const logger = require('./utils/logger');

// ===================================
// VALIDATE REQUIRED ENV VARS
// ===================================
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
    logger.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
    logger.error('Create a .env file based on .env.example');
    process.exit(1);
}

const { renderAdminDashboard } = require('./utils/renderAdminDashboard');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { startEmailWorker } = require('./workers/emailWorker');
const { testConnection } = require('./config/openai');
const errorHandler = require('./middleware/errorHandler');
const { connectMongoDB, closeMongoConnection } = require('./config/mongodb');
const { connectRedis, closeRedisConnection } = require('./config/redis');

// Initialize Express app
const app = express();

// Sau reverse proxy (Render/Railway/Nginx), req.ip là IP của PROXY chứ không
// phải của client → rate limit dồn mọi người vào một rổ và log IP vô nghĩa.
// Đặt SỐ CHẶNG cụ thể, không dùng `true`: `true` là tin toàn bộ chuỗi
// X-Forwarded-For, client tự bịa header là qua mặt được rate limit.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

const { requestMetricsMiddleware } = require('./utils/requestMetrics');

// ===================================
// MIDDLEWARE
// ===================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // ── Mọi mục dưới đây là tài nguyên bản build THẬT SỰ nạp ────────────
            // CSP này viết từ thời chỉ có admin panel chạy dưới nó. Từ khi backend
            // phục vụ luôn bản build React, frontend mới vào nằm dưới cùng chính
            // sách — và `vite dev` chưa bao giờ gửi CSP nên không chỗ nào lộ ra lúc
            // dev. Mỗi dòng thêm ở đây tương ứng một tính năng đã chết im lặng.

            // `accounts.google.com/gsi/client` nạp bằng document.createElement
            // ('script') trong GoogleSignInButton.jsx:12-19 → cần cả scriptSrcElem.
            // Đã BỎ cdn.jsdelivr.net và cdnjs.cloudflare.com: grep cả repo ra 0 chỗ
            // nạp: panel admin dùng FontAwesome vendored cục bộ
            // (`/admin/vendor/fontawesome/`), frontend dùng gói npm. Origin thừa
            // trong scriptSrc là một nơi mà thẻ <script src> chèn được vẫn tải mã
            // về — jsdelivr phục vụ mọi gói npm/GitHub theo URL nên không phải một
            // khoản cấp hẹp. Nó nằm ngay dưới lớp vừa dựng: 211 chỗ innerHTML đã
            // escape + adminEscaping.test.js.
            scriptSrc: ["'self'", "https://accounts.google.com"],
            scriptSrcElem: ["'self'", "https://accounts.google.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
            // GSI nạp stylesheet riêng `accounts.google.com/gsi/style` bằng thẻ
            // <link>. `styleSrc` KHÔNG phủ được nó khi trình duyệt hỗ trợ
            // style-src-elem: thiếu dòng này thì nút "Đăng nhập bằng Google" hiện
            // ra không có CSS — hoặc không hiện gì cả. Đây là lần thứ tư CSP làm
            // chết im lặng một tính năng: mỗi loại tài nguyên có directive riêng,
            // khai thiếu một cái là hỏng đúng một chỗ mà server không thấy gì.
            styleSrcElem: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
            // FontAwesome nhúng woff2 dạng `data:font/woff2;base64,...` thẳng trong
            // CSS đã build. Thiếu `data:` là mọi icon biến thành ô vuông trống.
            fontSrc: ["'self'", "data:"],
            imgSrc: ["'self'", "data:", "https:"],
            // Nút "Đăng nhập bằng Google" render trong iframe của GSI.
            frameSrc: ["'self'", "https://accounts.google.com"],
            // Audio đề TOEIC nằm trên Cloudinary (699 URL trong `toeic_question_sets`).
            // KHÔNG có directive này thì media rơi về `defaultSrc: 'self'` và trình
            // duyệt CHẶN THẲNG mọi file audio ngoài origin — không request, không log,
            // chỉ có "Không thể phát file audio" ở client. Lúc frontend còn chạy bằng
            // `vite dev` thì không lộ, vì dev server không gửi CSP nào cả; nó chỉ xuất
            // hiện từ khi backend phục vụ luôn bản build.
            // `translate.google.com/translate_tts` phát qua `new Audio(url)` ở
            // TranslateModal.jsx:45-49 — cũng là media, không phải connect.
            // `blob:` là BẮT BUỘC, không phải nới lỏng cho tiện: `/api/tts` stream
            // audio/mpeg về, client bọc thành Object URL rồi mới phát
            // (frontend/src/api/tts.js:15). Thiếu `blob:` thì trình duyệt chặn, TTS
            // rơi về giọng mặc định của hệ điều hành — người dùng chọn giọng nào
            // cũng nghe ra CÙNG MỘT giọng, mà không có lỗi nào ngoài console.
            // `blob:` chỉ cho phép nội dung do CHÍNH trang này tạo ra, không mở
            // cửa cho nguồn ngoài.
            mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com", "https://translate.google.com"],
            // `translate.googleapis.com` là fetch dịch nhanh (Shift+Enter) ở
            // TranslateModal.jsx:108 và exampleFillBlank.js:17.
            // `https://*.onrender.com` cũng bỏ: nó có nghĩa khi frontend nằm ở host
            // khác và gọi chéo sang backend. Từ khi backend phục vụ luôn bản build
            // thì mọi lời gọi là cùng origin, `'self'` phủ hết — giữ lại chỉ là cấp
            // quyền cho MỌI subdomain onrender.com mà không ai dùng. Tách host trở
            // lại thì thêm đúng origin cụ thể, đừng thêm wildcard.
            connectSrc: ["'self'", "https://translate.googleapis.com", "https://accounts.google.com"],
        }
    },
    // COOP KHÔNG nằm trong CSP — khai CSP đủ cho Google vẫn không cứu được.
    // Mặc định của helmet là 'same-origin', header đó CẮT window.opener của mọi
    // popup. Đăng nhập Google xong, popup gọi opener.postMessage(credential) để
    // trả ID token về → opener là null → TypeError trong gsi/transform, popup
    // trắng và không tự đóng, không có lỗi nào ở phía app chỉ ra nguyên nhân.
    //
    // Cùng loại bẫy với mediaSrc ở trên: `vite dev` không gửi header nào cả nên
    // chạy máy mình vẫn đăng nhập được, chỉ hỏng từ khi backend phục vụ bản build.
    //
    // 'same-origin-allow-popups' chỉ nới đúng phần popup do chính trang mở ra trả
    // kết quả về; vẫn chặn tab-nabbing (trang khác mở mình thì không với tới được).
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(compression({
    level: 6,           // Compression level (0-9, 6 is good balance)
    threshold: 1024,    // Only compress responses > 1KB
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));
// Delegate dạng `cors(fn(req, cb))` — cần `req` chứ không chỉ chuỗi origin, vì
// luật quan trọng nhất là "origin của CHÍNH request luôn được phép" mà chỉ `req`
// mới biết. Bản cũ chỉ nhận `origin` nên phải khai domain production vào env, và
// quên là hỏng IM LẶNG: GET không gửi header `Origin` nên trang vẫn load đẹp,
// chỉ POST mới chết — nhìn hệt như app đã ổn cho tới lúc ai đó bấm Đăng nhập.
// Chi tiết luật ở utils/corsPolicy.js.
const { corsOptionsDelegate } = require('./utils/corsPolicy');
app.use(cors(corsOptionsDelegate));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', { stream: logger.stream }));

// ===================================
// REQUEST METRICS MIDDLEWARE
// ===================================
app.use(requestMetricsMiddleware);

// ===================================
// SWAGGER API DOCS
// ===================================
// CHỈ mở ở môi trường dev. Trên production, /api-docs đưa cho người lạ bản đồ
// đầy đủ mọi endpoint (kể cả nhóm admin) kèm sẵn client để bấm thử — không tự
// nó cho quyền gì, nhưng xoá sạch công đoạn dò tìm. Bật lại bằng ENABLE_API_DOCS
// nếu cần xem trên server thật.
// FAIL CLOSED: điều kiện cũ là `NODE_ENV !== 'production'`, tức THIẾU biến thì
// `'undefined' !== 'production'` → true → docs mở toang. Đó đúng là trạng thái của
// một image không khai báo NODE_ENV hoặc một platform không tự tiêm, và nó im lặng.
// Giờ phải nói ĐÚNG là development, hoặc bật tay bằng ENABLE_API_DOCS.
if (process.env.NODE_ENV === 'development' || process.env.ENABLE_API_DOCS === 'true') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customSiteTitle: 'TOEIC API Docs',
        customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
        swaggerOptions: { persistAuthorization: true },
    }));
    // JSON spec endpoint (để import vào Postman / Insomnia)
    app.get('/api-docs.json', (_, res) => res.json(swaggerSpec));
}

// ===================================
// SERVE STATIC FILES
// ===================================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/static', express.static(path.join(__dirname, 'public', 'admin')));

// ── Bản build của frontend React ─────────────────────────────────────────────
// Frontend gọi `fetch('/api/...')` — đường dẫn TƯƠNG ĐỐI so với origin đang phục
// vụ nó (72 chỗ trong 29 file). Lúc `vite dev` thì proxy trong vite.config.js đẩy
// `/api` sang đây nên chạy được; **bản build không có proxy nào cả**. Tách frontend
// sang host khác là cả 72 lời gọi trỏ vào host đó → 404 sạch, app render xong rồi
// đứng im mà server không ghi một dòng lỗi nào.
// Phục vụ SPA từ chính tiến trình này → cùng origin → `/api`, `/uploads`,
// `/tts-cache`, `/assets` đều đúng mà không phải sửa file nào bên frontend.
// Thiếu thư mục build (chưa `npm run build`, hoặc image chỉ có backend) thì bỏ
// qua: API vẫn chạy bình thường, chỉ không có SPA để trả.
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
const hasFrontendBuild = require('fs').existsSync(path.join(FRONTEND_DIST, 'index.html'));
if (hasFrontendBuild) {
    app.use(express.static(FRONTEND_DIST));
} else {
    logger.warn('frontend/dist chưa có — chỉ phục vụ API. Chạy `npm run build` trước khi deploy.');
}

// ===================================
// API ROUTES (Mount BEFORE server starts)
// ===================================

app.get('/api', (req, res) => {
    res.json({
        message: 'LevelUp TOEIC API',
        version: '2.0.0',
        database: 'MongoDB',
    });
});

// Health check endpoint for dashboard
app.get('/health', async (_, res) => {
    const { mongoose: mg } = require('./config/mongodb');
    const Vocabulary = require('./models/Vocabulary');
    const mongoStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const mongoState = mongoStates[mg.connection.readyState] || 'unknown';
    const mongoOk = mg.connection.readyState === 1;

    let vocabularyCount = 0;
    try {
        // `estimatedDocumentCount` đọc metadata (O(1)); `countDocuments()` không
        // lọc là aggregation QUÉT CẢ COLLECTION. Docker healthcheck gọi mỗi 30s
        // → ~2.880 lượt quét/ngày trên Atlas, cho hai con số mà chính liveness
        // không dùng: status quyết định bởi `readyState` ở dưới. Con số này chỉ
        // để hiển thị lên dashboard, xấp xỉ là đủ.
        vocabularyCount = await Vocabulary.estimatedDocumentCount();
    } catch (_) {}

    let usersCount = 0;
    try {
        usersCount = await require('./models/User').estimatedDocumentCount();
    } catch (_) {}

    const status = mongoOk ? 'OK' : 'DEGRADED';
    res.status(mongoOk ? 200 : 503).json({
        status,
        uptime: Math.floor(process.uptime()),
        mongodb: mongoState,
        vocabularyCount,
        usersCount,
        timestamp: new Date().toISOString(),
    });
});

// ===================================
// KHÔNG CACHE PHẢN HỒI API
// ===================================
// Express bật ETag mặc định cho MỌI phản hồi. Với API dữ liệu động thì đó là
// cái bẫy: trình duyệt gửi kèm `If-None-Match`, server thấy nội dung chưa đổi
// (theo hash) nên trả 304 và `fetch` dùng lại body CŨ trong cache.
//
// Triệu chứng thực tế: bấm "Tải lại" ở popup Chọn đề thì danh sách không đổi —
// phải đóng popup mở lại mới thấy dữ liệu mới. Không có lỗi nào, request vẫn
// 200/304 bình thường, nên rất khó lần ra.
//
// Đặt TRƯỚC mọi route /api để phủ hết. Tài nguyên tĩnh (ảnh, JS, CSS) vẫn giữ
// cache — chúng nằm ở middleware khác.
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
});
app.set('etag', false);

// ===================================
// ADMIN METRICS + STATS (system metrics, user growth)
// ===================================
app.use('/api/admin', require('./routes/adminMetrics'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/user', require('./routes/userState'));
app.use('/api/practice', require('./routes/practice'));
app.use('/api/vocabulary', require('./routes/vocabulary'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/wrong-words', require('./routes/wrongWords')); // Wrong words with spaced repetition
app.use('/api/activities', require('./routes/activity')); // Activity logs for dashboard
app.use('/api/toeic', require('./routes/toeic')); // TOEIC 7-Part Test System
app.use('/api/toeic-series', require('./routes/toeicSeries')); // Danh mục bộ đề TOEIC (dựng thanh lọc Full Test)
app.use('/api/tts', require('./routes/tts')); // Text-to-Speech natural voice
app.use('/api/reports', require('./routes/reports')); // User reports / feedback
app.use('/api/topics', require('./routes/topics'));   // Vocabulary topic/dataset management
app.use('/api/upload', require('./routes/uploadRoutes')); // User vocabulary uploads with admin management
app.use('/api/admin', require('./routes/adminDefinitions')); // Achievement + Quest definitions (admin)
app.use('/api/categories', require('./routes/categories')); // Danh mục (public GET để dựng tab)
app.use('/api/features', require('./routes/features'));     // Mốc mở khoá theo Level
app.use('/api/admin/db', require('./routes/adminDb'));       // MongoDB collection manager (admin)
app.use('/api/admin/cloudinary', require('./routes/adminCloudinary')); // Kho ảnh/audio trên Cloudinary (admin)
app.use('/api/quests', require('./routes/quests'));          // Quest system (daily/weekly/monthly/special)
app.use('/api/checkin', require('./routes/checkin'));        // Weekly check-in (điểm danh hằng tuần)
app.use('/api/notifications', require('./routes/notifications')); // In-app notification center
app.use('/api/spin', require('./routes/spin'));              // Lucky spin wheel (1 lần/ngày)
app.use('/api/season', require('./routes/season'));          // Mùa giải: đếm ngược + reset mùa
app.use('/api/inventory', require('./routes/inventory'));    // Túi đồ: item_definitions + inventory_items

// ===================================
// DASHBOARD & SPA (Catch-all)
// ===================================
app.get('/dashboard', (req, res) => {
    res.send(renderAdminDashboard());
});

// Data file 404 Handler (Specific for /data folder)
app.use('/data/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Data file not found: ${req.originalUrl}`,
    });
});

// API 404 Handler
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    });
});

// Admin SPA Fallback (chỉ dành cho admin dashboard)
app.get('/admin/*', (req, res) => {
    res.send(renderAdminDashboard());
});

// SPA Fallback cho frontend React — PHẢI đứng sau handler 404 của `/api/*` ở
// trên. Đảo thứ tự là catch-all nuốt mọi URL /api gõ sai và trả về HTML cho một
// lời gọi fetch: client parse HTML thành JSON rồi báo một lỗi không liên quan gì
// tới nguyên nhân thật.
// Chỉ trả index.html cho đường dẫn ĐIỀU HƯỚNG (không có đuôi file). Nếu bắt tất,
// một file ảnh/audio thiếu sẽ trả HTML kèm status 200 thay vì 404: `<img>` và
// `<audio>` nhận HTML rồi hỏng lúc decode, không còn tín hiệu nào để lần ra.
// Nguy hiểm nhất là nó CHE ĐÚNG triệu chứng của DEPLOY-deployment-004 (ảnh upload
// biến mất sau mỗi lần redeploy) — ảnh hỏng mà server báo 200.
if (hasFrontendBuild) {
    app.get('*', (req, res, next) => {
        if (path.extname(req.path)) return next();   // trông như file → để 404 thật
        res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
}

// ===================================
// ERROR HANDLER (Must be last middleware)
// ===================================
app.use(errorHandler);

// ===================================
// START SERVER
// ===================================
const PORT = process.env.PORT || 5000;
let emailWorker = null;
let httpServer = null;   // giữ tay cầm để shutdown() ngừng nhận request trước khi đóng DB

const { migrateUserDependents, seedAchievementDefinitions } = require('./services/startupTasks');

async function startServer() {
    logger.info('Connecting to databases...');

    await connectMongoDB();
    // Redis là tùy chọn (cache + queue đều có fallback). KHÔNG await — nếu Redis
    // không chạy, await sẽ kẹt ở vòng reconnect và app.listen() không bao giờ tới
    // → mọi /api trả 502. Kết nối nền: có thì dùng, không thì server vẫn chạy.
    connectRedis().catch((e) => logger.warn('Redis init skipped (server continues)', { error: e.message }));

    // Create missing UserProfile/UserStats for pre-restructure accounts
    await migrateUserDependents();

    // Seed achievement definitions if collection is empty
    await seedAchievementDefinitions();

    // Khởi động background workers (tự fallback nếu Redis chưa sẵn sàng)
    emailWorker = startEmailWorker();

    // Mùa giải: kiểm tra & tự reset khi quá hạn (mỗi phút + 1 lần lúc khởi động)
    const { checkAndAutoReset } = require('./services/seasonService');
    checkAndAutoReset();
    setInterval(() => checkAndAutoReset(), 60 * 1000);

    httpServer = app.listen(PORT, async () => {
        logger.info(`Server running on port ${PORT}`, {
            env: process.env.NODE_ENV || 'development',
            port: PORT,
        });

        if (process.env.OPENAI_API_KEY) {
            await testConnection();
        } else {
            logger.warn('OpenAI API key not configured');
        }
    });
}

startServer().catch(err => {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
});

async function shutdown(signal) {
    logger.info(`${signal} received — shutting down gracefully...`);

    const forceExit = setTimeout(() => {
        logger.error('Graceful shutdown timed out — forcing exit');
        process.exit(1);
    }, 15_000);
    forceExit.unref();

    // NGỪNG NHẬN REQUEST TRƯỚC, rồi mới đóng thứ mà request đang dùng. Đảo thứ
    // tự này là mỗi lần deploy, request dở dang (đang chấm bài, đang trừ xu)
    // gặp lỗi database. emailWorker.close() bên dưới vốn đã làm đúng thứ tự đó
    // cho job; HTTP chỉ là thiếu tay cầm. Bộ đếm 15s ở trên bao luôn bước này
    // nên một request treo không giữ deploy lại được.
    if (httpServer) {
        await new Promise(resolve => httpServer.close(resolve));
        logger.info('HTTP server closed — no longer accepting requests.');
    }

    await Promise.allSettled([
        closeMongoConnection(),
        closeRedisConnection(),
        emailWorker?.close(),   // drain jobs đang chạy trước khi tắt
    ]);
    clearTimeout(forceExit);
    logger.info('All connections closed.');
    process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { reason: String(reason) });
    shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
});

