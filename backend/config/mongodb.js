const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Stale indexes from the old monolithic User schema that are no longer valid
const STALE_INDEXES = [
    { collection: 'users', index: 'username_1' },
];

async function dropStaleIndexes(conn) {
    for (const { collection, index } of STALE_INDEXES) {
        try {
            const indexes = await conn.db.collection(collection).indexes();
            const exists = indexes.some(idx => idx.name === index);
            if (exists) {
                await conn.db.collection(collection).dropIndex(index);
                logger.info(`Dropped stale index ${collection}.${index}`);
            }
        } catch (err) {
            logger.warn(`Could not drop stale index ${collection}.${index}`, { error: err.message });
        }
    }
}

/**
 * Connect to MongoDB Atlas
 */
const connectMongoDB = async () => {
    try {
        const MONGODB_URI = process.env.MONGODB_URI;

        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env file');
        }

        logger.info('Connecting to MongoDB Atlas...');

        await mongoose.connect(MONGODB_URI, {
            maxPoolSize: 50,
            minPoolSize: 10,
            maxIdleTimeMS: 30000,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        logger.info('MongoDB Connected', {
            host: mongoose.connection.host,
            db: mongoose.connection.name,
            pool: 'min=10, max=50',
        });

        // Drop stale indexes left over from old monolithic User schema
        await dropStaleIndexes(mongoose.connection);

        if (mongoose.connection.listenerCount('error') === 0) {
            mongoose.connection.on('error', (err) => {
                logger.error('MongoDB error', { error: err.message });
            });

            mongoose.connection.on('disconnected', () => {
                logger.warn('MongoDB disconnected — Mongoose will auto-reconnect');
            });

            mongoose.connection.on('reconnected', () => {
                logger.info('MongoDB reconnected');
            });
        }

        return { success: true };
    } catch (error) {
        logger.error('MongoDB Connection Error', { error: error.message });
        throw error;
    }
};

/**
 * Close MongoDB connection
 */
const closeMongoConnection = async () => {
    try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
    } catch (error) {
        logger.error('Error closing MongoDB', { error: String(error) });
    }
};

module.exports = {
    connectMongoDB,
    closeMongoConnection,
    mongoose
};
