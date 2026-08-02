const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Thư mục logs chỉ tạo khi THẬT SỰ ghi file — cùng điều kiện với transport bên
// dưới. Tạo theo NODE_ENV như cũ là đẻ một thư mục rỗng trong mọi container.
const LOG_DIR = path.join(__dirname, '..', 'logs');

const { combine, timestamp, printf, colorize, errors, json } = format;

const isProd = process.env.NODE_ENV === 'production';

// ─── Custom format cho console (dev) ─────────────────────────────────────────
const consoleFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `${timestamp} [${level}] ${stack || message}${metaStr}`;
    })
);

// ─── Format cho file (production) ────────────────────────────────────────────
const fileFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

// ─── Transports ───────────────────────────────────────────────────────────────
const logTransports = [
    // Console — dev: colorized, prod: JSON
    new transports.Console({
        format: isProd ? fileFormat : consoleFormat,
        level: isProd ? 'http' : 'debug',
    }),
];

// File rotation — phải BẬT TƯỜNG MINH, không suy ra từ NODE_ENV.
// Trên Render/Railway thư mục logs nằm trong container ephemeral: không shell nào
// với tới, và mất sạch mỗi lần redeploy — hai transport dưới đây khai retention
// 14/30 ngày cho những file không sống nổi một ngày, lại còn gzip mỗi lần xoay.
// Transport console ở trên đã đẩy JSON ra stdout, tức nền tảng đã thu log rồi.
// Deploy kiểu VPS + docker-compose thì đặt LOG_TO_FILE=true và mount /app/logs.
const logToFile = isProd && process.env.LOG_TO_FILE === 'true';
if (logToFile) {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    logTransports.push(
        // Tất cả log từ info trở lên
        new DailyRotateFile({
            filename: path.join(LOG_DIR, 'app-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            level: 'info',
            format: fileFormat,
        }),
        // Chỉ error log riêng — dễ alert
        new DailyRotateFile({
            filename: path.join(LOG_DIR, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d',
            level: 'error',
            format: fileFormat,
        })
    );
}

// ─── Logger instance ──────────────────────────────────────────────────────────
const logger = createLogger({
    level: isProd ? 'http' : 'debug',
    defaultMeta: { service: 'levelup-toeic' },
    transports: logTransports,
    exitOnError: false,
});

// ─── HTTP request stream cho Morgan ──────────────────────────────────────────
logger.stream = {
    write: (message) => logger.http(message.trim()),
};

module.exports = logger;
