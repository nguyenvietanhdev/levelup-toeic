/**
 * Smoke test — Phase 2 edge validation (the "field silently dropped/missing"
 * bug class). Locks middleware/validate.js + the live schemas.
 * Pure (calls middleware directly with a fake req), no DB. Run: npm test
 */
const validate = require('../middleware/validate');
const ApiError = require('../utils/ApiError');
const { shopPurchase, vocabUpload } = require('../validators/schemas');

// Run a validate() middleware against a body; resolve with the value passed
// to next() (undefined = passed validation).
function run(schema, body) {
    return new Promise((resolve) => {
        validate(schema)({ body }, {}, (err) => resolve(err));
    });
}

describe('validate() middleware', () => {
    test('missing required field → ApiError 400 with the schema message', async () => {
        const err = await run({ x: { required: true, message: 'X is required' } }, {});
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(400);
        expect(err.message).toBe('X is required');
    });

    test('blank/whitespace string counts as missing', async () => {
        const err = await run({ x: { required: true, message: 'X is required' } }, { x: '   ' });
        expect(err).toBeInstanceOf(ApiError);
        expect(err.message).toBe('X is required');
    });

    test('valid input calls next() with no error (no behaviour change)', async () => {
        const err = await run({ x: { required: true } }, { x: 'ok' });
        expect(err).toBeUndefined();
    });

    test('type mismatch is rejected', async () => {
        const err = await run({ n: { type: 'number' } }, { n: 'not-a-number' });
        expect(err).toBeInstanceOf(ApiError);
    });

    test('minLength enforced (trimmed)', async () => {
        const err = await run({ p: { minLength: 6 } }, { p: ' abc ' });
        expect(err).toBeInstanceOf(ApiError);
    });

    test('optional absent field passes; unknown fields pass through', async () => {
        const err = await run({ opt: { type: 'string' } }, { other: 1 });
        expect(err).toBeUndefined();
    });
});

describe('live schemas mirror controller contracts', () => {
    test('shop/purchase requires itemId with exact message', async () => {
        expect((await run(shopPurchase, {})).message).toBe('Item ID is required');
        expect(await run(shopPurchase, { itemId: 'x2_coins' })).toBeUndefined();
    });

    test('upload/vocabulary requires en/part/source with exact messages', async () => {
        expect((await run(vocabUpload, { part: 'P1', source: 's' })).message).toBe('English is required');
        expect((await run(vocabUpload, { en: 'a', source: 's' })).message).toBe('Part is required');
        expect((await run(vocabUpload, { en: 'a', part: 'P1' })).message).toBe('Source is required');
        expect(await run(vocabUpload, { en: 'arrange', part: 'P1', source: 'ets2024' })).toBeUndefined();
    });
});
