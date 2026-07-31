const logger = require('../utils/logger');

/**
 * Custom error handler middleware
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
    let error = { ...err };
    error.message = err.message;

    logger.error('Request error', {
        method: req.method,
        url: req.originalUrl,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });

    if (err.name === 'CastError') {
        error = { message: 'Resource not found', statusCode: 404 };
    }

    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        error = { message: `${field} already exists`, statusCode: 400 };
    }

    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = { message, statusCode: 400 };
    }

    if (err.name === 'JsonWebTokenError') {
        error = { message: err.message || 'Invalid token', statusCode: 401 };
    }

    if (err.name === 'TokenExpiredError') {
        error = { message: err.message || 'Token expired', statusCode: 401 };
    }

    res.status(error.statusCode || err.statusCode || 500).json({
        success: false,
        message: error.message || 'Server Error',
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            error: err,
        }),
    });
};

module.exports = errorHandler;
