/**
 * BullMQ Queue definitions
 *
 * Mỗi Queue chỉ là một "kênh giao việc" — không xử lý logic.
 * Logic thực sự nằm ở Worker tương ứng trong /workers/.
 *
 * Connection dùng chung REDIS_URL từ env (cùng Redis instance với cache).
 */
const { Queue } = require('bullmq');
const logger = require('../utils/logger');

const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
};

// ── Email Queue ───────────────────────────────────────────────────────────────
const emailQueue = new Queue('email', {
    connection,
    defaultJobOptions: {
        attempts: 3,                        // retry tối đa 3 lần
        backoff: { type: 'exponential', delay: 5000 }, // 5s → 10s → 20s
        removeOnComplete: { count: 100 },   // giữ 100 job hoàn thành gần nhất
        removeOnFail: { count: 50 },        // giữ 50 job lỗi để debug
    },
});

let queueErrLogged = false;
emailQueue.on('error', (err) => {
    if (!queueErrLogged) {
        logger.error('Email queue error (Redis unavailable — further errors suppressed)', { error: err.message });
        queueErrLogged = true;
    }
});

logger.info('BullMQ queues initialized', { queues: ['email'] });

module.exports = { emailQueue };
