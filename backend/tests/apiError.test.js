/**
 * Smoke test — Phase 1 error contract.
 * Locks ApiError: status codes + shape the central errorHandler relies on.
 * Pure, no DB. Run: npm test
 */
const ApiError = require('../utils/ApiError');

describe('ApiError', () => {
    test('is a real Error with statusCode + message', () => {
        const e = new ApiError('boom', 418);
        expect(e).toBeInstanceOf(Error);
        expect(e.name).toBe('ApiError');
        expect(e.statusCode).toBe(418);
        expect(e.message).toBe('boom');
        expect(e.isOperational).toBe(true);
    });

    test('defaults to 500 when status omitted', () => {
        expect(new ApiError('x').statusCode).toBe(500);
    });

    test('static helpers map to correct HTTP codes', () => {
        expect(ApiError.badRequest('a').statusCode).toBe(400);
        expect(ApiError.unauthorized().statusCode).toBe(401);
        expect(ApiError.forbidden().statusCode).toBe(403);
        expect(ApiError.notFound('nope').statusCode).toBe(404);
        expect(ApiError.conflict().statusCode).toBe(409);
    });

    test('helpers preserve the client-facing message', () => {
        expect(ApiError.badRequest('Thiếu email').message).toBe('Thiếu email');
        expect(ApiError.notFound().message).toBe('Not found');
    });
});
