/**
 * Smoke test — TOEIC score path (real "money/score" logic that Phase 4 will
 * touch when toeicController is split). Pure utility, no DB. Run: npm test
 *
 * Goal: a safety net so a future refactor that accidentally changes scoring
 * is caught — not an exhaustive ETS-accuracy check.
 */
const {
    convertToToeicScore,
    getScoreBand,
    calculatePercentile,
} = require('../utils/toeicScoreConverter');

describe('convertToToeicScore', () => {
    test('known anchors from the conversion table', () => {
        expect(convertToToeicScore('listening', 0)).toBe(5);
        expect(convertToToeicScore('listening', 5)).toBe(25);
        expect(convertToToeicScore('reading', 0)).toBe(5);
    });

    test('output stays within the valid 5–495 band', () => {
        for (const n of [0, 25, 50, 75, 100]) {
            const ls = convertToToeicScore('listening', n);
            const rs = convertToToeicScore('reading', n);
            expect(ls).toBeGreaterThanOrEqual(5);
            expect(ls).toBeLessThanOrEqual(495);
            expect(rs).toBeGreaterThanOrEqual(5);
            expect(rs).toBeLessThanOrEqual(495);
        }
    });

    test('clamps out-of-range correct answers', () => {
        expect(convertToToeicScore('listening', -10)).toBe(convertToToeicScore('listening', 0));
        expect(convertToToeicScore('listening', 999)).toBe(convertToToeicScore('listening', 100));
    });

    test('more correct answers never lowers the score (monotonic)', () => {
        let prev = -1;
        for (let n = 0; n <= 100; n++) {
            const s = convertToToeicScore('listening', n);
            expect(s).toBeGreaterThanOrEqual(prev);
            prev = s;
        }
    });

    test('invalid section throws', () => {
        expect(() => convertToToeicScore('speaking', 10)).toThrow();
    });
});

describe('getScoreBand', () => {
    test('maps scores to the correct band label', () => {
        expect(getScoreBand(990)).toBe('945-990');
        expect(getScoreBand(700)).toBe('605-784');
        expect(getScoreBand(250)).toBe('10-254');
    });

    test('out-of-range → Unknown', () => {
        expect(getScoreBand(5)).toBe('Unknown');     // below min band (10)
        expect(getScoreBand(1200)).toBe('Unknown');
    });
});

describe('calculatePercentile', () => {
    test('empty population → neutral 50', () => {
        expect(calculatePercentile(500, [])).toBe(50);
    });

    test('fraction of strictly-lower scores, rounded', () => {
        expect(calculatePercentile(250, [100, 200, 300])).toBe(67); // 2/3 → 66.6 → 67
        expect(calculatePercentile(100, [100, 200, 300])).toBe(0);  // none lower
    });
});
