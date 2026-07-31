const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
    try {
        const redisConfig = {
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            socket: {
                connectTimeout: 5000,
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        logger.error('Redis: Too many retry attempts, giving up');
                        return new Error('Too many retries');
                    }
                    return Math.min(retries * 100, 3000);
                },
            },
        };

        logger.info('Connecting to Redis...');

        redisClient = createClient(redisConfig);

        redisClient.on('error', (err) => {
            logger.warn('Redis Client Error', { error: err.message });
        });

        redisClient.on('connect', () => {
            logger.info('Redis Connected');
        });

        redisClient.on('ready', () => {
            logger.info('Redis Ready');
        });

        redisClient.on('reconnecting', () => {
            logger.info('Redis Reconnecting...');
        });

        await redisClient.connect();

        return { success: true, client: redisClient };
    } catch (error) {
        logger.warn('Redis Connection Failed — server will continue without cache', { error: error.message });
        return { success: false, client: null };
    }
};

const closeRedisConnection = async () => {
    try {
        if (redisClient && redisClient.isOpen) {
            await redisClient.quit();
            logger.info('Redis connection closed');
        }
    } catch (error) {
        logger.error('Error closing Redis', { error: String(error) });
    }
};

const getCache = async (key) => {
    try {
        if (!redisClient || !redisClient.isOpen) return null;
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        logger.warn('Redis GET error', { key, error: error.message });
        return null;
    }
};

const setCache = async (key, value, ttl = 300) => {
    try {
        if (!redisClient || !redisClient.isOpen) return false;
        await redisClient.setEx(key, ttl, JSON.stringify(value));
        return true;
    } catch (error) {
        logger.warn('Redis SET error', { key, error: error.message });
        return false;
    }
};

const deleteCache = async (key) => {
    try {
        if (!redisClient || !redisClient.isOpen) return false;
        await redisClient.del(key);
        return true;
    } catch (error) {
        logger.warn('Redis DEL error', { key, error: error.message });
        return false;
    }
};

const clearCachePattern = async (pattern) => {
    try {
        if (!redisClient || !redisClient.isOpen) return false;
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) await redisClient.del(keys);
        return true;
    } catch (error) {
        logger.warn('Redis CLEAR error', { pattern, error: error.message });
        return false;
    }
};

module.exports = {
    connectRedis,
    closeRedisConnection,
    getCache,
    setCache,
    deleteCache,
    clearCachePattern,
    getClient: () => redisClient,
};
