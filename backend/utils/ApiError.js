/**
 * Typed application error. Throw or `next(new ApiError(msg, status))` for
 * EXPECTED failures (validation, not-found, auth). The central
 * middleware/errorHandler.js already honours `err.statusCode` and emits the
 * standard `{ success:false, message }` shape — so this needs no handler
 * change. Unexpected errors keep flowing as plain Error → 500.
 */
class ApiError extends Error {
    /**
     * @param {string} message  client-facing message
     * @param {number} statusCode  HTTP status (default 500)
     */
    constructor(message, statusCode = 500) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.isOperational = true; // distinguishes expected vs bug
        Error.captureStackTrace?.(this, ApiError);
    }

    static badRequest(msg = 'Bad request') { return new ApiError(msg, 400); }
    static unauthorized(msg = 'Unauthorized') { return new ApiError(msg, 401); }
    static forbidden(msg = 'Forbidden') { return new ApiError(msg, 403); }
    static notFound(msg = 'Not found') { return new ApiError(msg, 404); }
    static conflict(msg = 'Conflict') { return new ApiError(msg, 409); }
}

module.exports = ApiError;
