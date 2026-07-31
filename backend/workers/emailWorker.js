/**
 * Email Worker
 *
 * Lắng nghe queue "email", xử lý từng job gửi OTP.
 * Chạy trong cùng process với server — không cần spawn riêng.
 *
 * Job data format:
 *   { to: string, code: string, type: 'reset' | 'register' }
 */
const { Worker } = require('bullmq');
const { sendOtpEmail } = require('../utils/emailService');
const logger = require('../utils/logger');

const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
};

/**
 * Khởi động email worker — gọi một lần khi server start.
 * @returns {Worker}
 */
function startEmailWorker() {
    const worker = new Worker(
        'email',
        async (job) => {
            const { to, code, type } = job.data;

            logger.info('Processing email job', {
                jobId: job.id,
                to,
                type,
                attempt: job.attemptsMade + 1,
            });

            await sendOtpEmail(to, code, type);

            logger.info('Email sent successfully', { jobId: job.id, to });
        },
        {
            connection,
            concurrency: 5,   // xử lý tối đa 5 email cùng lúc
        }
    );

    worker.on('completed', (job) => {
        logger.debug('Email job completed', { jobId: job.id });
    });

    worker.on('failed', (job, err) => {
        const maxAttempts = job?.opts?.attempts ?? 3;
        const isFinal = (job?.attemptsMade ?? 0) >= maxAttempts;

        logger.error('Email job failed', {
            jobId: job?.id,
            to: job?.data?.to,
            attempt: job?.attemptsMade,
            maxAttempts,
            final: isFinal,
            error: err.message,
        });
    });

    let workerErrLogged = false;
    worker.on('error', (err) => {
        if (!workerErrLogged) {
            logger.error('Email worker error (Redis unavailable — further errors suppressed)', { error: err.message });
            workerErrLogged = true;
        }
    });

    logger.info('Email worker started', { concurrency: 5 });
    return worker;
}

module.exports = { startEmailWorker };
