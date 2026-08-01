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
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcElem: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://*.onrender.com"],
        }
    }
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
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:5173', 'http://127.0.0.1:5173', `http://localhost:${process.env.PORT || 5000}`];

app.use(cors({
    origin: (origin, callback) => {
        // same-origin requests have no Origin header — always allow
        if (!origin) return callback(null, true);
        // wildcard or no explicit whitelist → echo back the requesting origin
        if (!allowedOrigins) return callback(null, origin);
        // explicit whitelist
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
}));
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
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
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
        vocabularyCount = await Vocabulary.countDocuments();
    } catch (_) {}

    let usersCount = 0;
    try {
        usersCount = await require('./models/User').countDocuments();
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

