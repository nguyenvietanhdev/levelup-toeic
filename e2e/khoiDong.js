/**
 * Dựng môi trường E2E: MongoDB TẠM trong RAM + tài khoản thử + server thật phục vụ bản build
 * frontend (đúng như trang thật). Playwright chạy file này qua `webServer` và tắt nó khi xong.
 *
 * Không đụng database thật: dev và production đang dùng chung một database, nên E2E chạy trên
 * đó là tạo tài khoản và bài làm rác trong dữ liệu thật.
 *
 * Mọi khoá dịch vụ ngoài (AI, Cloudinary, Sentry, email, Redis) đặt RỖNG: test không gọi ra
 * ngoài, không tốn tiền, kết quả không phụ thuộc mạng. `dotenv` không ghi đè biến đã có, nên
 * giá trị rỗng ở đây thắng khoá thật trong `backend/.env`.
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { TAI_KHOAN, CONG } = require('./caiDat');

const GOC = path.join(__dirname, '..');
const BACKEND = path.join(GOC, 'backend');
const DIST = path.join(GOC, 'frontend', 'dist', 'index.html');

const KHOA_RONG = [
    'OPENAI_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY',
    'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
    'SENTRY_DSN', 'SENTRY_DSN_FRONTEND', 'REDIS_URL', 'EMAIL_USER', 'EMAIL_PASS', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS',
];

async function taoTaiKhoan(uri) {
    // Dùng đúng mongoose và model của backend để mật khẩu được mã hoá như thật.
    const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
    await mongoose.connect(uri);
    const User = require(path.join(BACKEND, 'models', 'User'));
    await User.create({ email: TAI_KHOAN.email, password: TAI_KHOAN.matKhau });
    await mongoose.disconnect();
}

(async () => {
    if (!fs.existsSync(DIST)) {
        console.error('[e2e] Chưa có bản build frontend. Chạy: npm run build');
        process.exit(1);
    }
    const mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri('levelup_e2e');
    await taoTaiKhoan(uri);

    const env = { ...process.env, MONGODB_URI: uri, JWT_SECRET: 'e2e-khoa-bi-mat', PORT: String(CONG), NODE_ENV: 'production' };
    for (const k of KHOA_RONG) env[k] = '';
    const server = spawn(process.execPath, ['server.js'], { cwd: BACKEND, env, stdio: 'inherit' });

    const tat = async () => {
        server.kill();
        await mongo.stop();
        process.exit(0);
    };
    process.on('SIGTERM', tat);
    process.on('SIGINT', tat);
    server.on('exit', async (ma) => {
        await mongo.stop();
        process.exit(ma ?? 1);
    });
})().catch((e) => {
    console.error('[e2e] Không dựng được môi trường:', e);
    process.exit(1);
});
