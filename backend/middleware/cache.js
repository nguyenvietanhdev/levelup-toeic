const { getCache, setCache } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Cache middleware
 * Usage: router.get('/api/tests', cacheMiddleware(300), getTests)
 *
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
 */
const cacheMiddleware = (ttl = 300) => {
    return async (req, res, next) => {
        if (req.method !== 'GET') return next();

        const cacheKey = `cache:${req.originalUrl || req.url}`;

        try {
            const cachedData = await getCache(cacheKey);

            if (cachedData) {
                logger.debug('Cache HIT', { key: cacheKey });
                return res.json(cachedData);
            }

            logger.debug('Cache MISS', { key: cacheKey });

            const originalJson = res.json.bind(res);
            res.json = (data) => {
                if (res.statusCode === 200) {
                    setCache(cacheKey, data, ttl).catch(err => {
                        logger.warn('Failed to cache response', { key: cacheKey, error: err.message });
                    });
                }
                return originalJson(data);
            };

            next();
        } catch (error) {
            logger.warn('Cache middleware error', { error: error.message });
            next();
        }
    };
};

module.exports = cacheMiddleware;
