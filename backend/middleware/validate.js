const ApiError = require('../utils/ApiError');

/**
 * Tiny zero-dependency body validator. Rejects bad input at the edge with
 * the standard error contract (ApiError → middleware/errorHandler.js → 400
 * `{ success:false, message }`).
 *
 * Schema: { fieldName: { required?, type?, minLength?, message? } }
 *   - required  : value must be present & (for strings) non-empty after trim
 *   - type      : 'string' | 'number' | 'boolean' | 'object' (typeof check)
 *   - minLength : for strings (trimmed)
 *   - message   : exact client-facing message on failure (keep parity with
 *                 the controller's existing message → no UX text change)
 *
 * Only declared fields are checked; unknown fields pass through (no
 * behaviour change for valid requests).
 */
function validate(schema) {
    return (req, _res, next) => {
        const body = req.body || {};
        for (const [field, rule] of Object.entries(schema)) {
            const value = body[field];
            const fail = (msg) => next(ApiError.badRequest(msg || rule.message || `${field} is invalid`));

            if (rule.required) {
                const empty = value === undefined || value === null
                    || (typeof value === 'string' && value.trim() === '');
                if (empty) return fail(rule.message || `${field} is required`);
            }

            if (value === undefined || value === null) continue; // optional & absent

            if (rule.type && typeof value !== rule.type) {
                return fail(rule.message || `${field} must be a ${rule.type}`);
            }

            if (rule.minLength && typeof value === 'string'
                && value.trim().length < rule.minLength) {
                return fail(rule.message || `${field} must be at least ${rule.minLength} characters`);
            }
        }
        next();
    };
}

module.exports = validate;
