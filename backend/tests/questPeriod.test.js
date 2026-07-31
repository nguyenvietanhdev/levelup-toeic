/**
 * Smoke test — quest period math. Locks behaviour while extracting it out
 * of questController. Assertions are structural/relative (not exact ISO)
 * so they don't depend on the server's local timezone.
 */
const { getPeriodKey, getNextReset } = require('../services/questPeriod');

const at = iso => new Date(iso);

describe('getPeriodKey', () => {
    test('daily = YYYY-MM-DD (UTC)', () => {
        expect(getPeriodKey('daily', at('2026-05-19T08:30:00Z'))).toBe('2026-05-19');
    });

    test('monthly = YYYY-MM (UTC)', () => {
        expect(getPeriodKey('monthly', at('2026-05-19T08:30:00Z'))).toBe('2026-05');
    });

    test('weekly: YYYY-Www, deterministic, +7d changes, Sun rolls to next week (quirk preserved)', () => {
        // Local-constructed dates → TZ-independent getDay()/getDate().
        const monday = new Date(2026, 4, 18, 10);   // Mon 2026-05-18
        const sunday = new Date(2026, 4, 24, 10);   // Sun 2026-05-24 (same calendar week)
        const nextMon = new Date(2026, 4, 25, 10);  // Mon 2026-05-25

        const kMon = getPeriodKey('weekly', monday);
        expect(kMon).toMatch(/^\d{4}-W\d{2}$/);
        // Deterministic.
        expect(getPeriodKey('weekly', new Date(2026, 4, 18, 10))).toBe(kMon);
        // Exactly +7 days = a different week key.
        expect(getPeriodKey('weekly', new Date(2026, 4, 25, 10))).not.toBe(kMon);
        // Original-logic quirk: Sunday maps to the FOLLOWING Monday's week.
        expect(getPeriodKey('weekly', sunday)).toBe(getPeriodKey('weekly', nextMon));
    });

    test('unknown / special → "special"', () => {
        expect(getPeriodKey('special', at('2026-05-19T00:00:00Z'))).toBe('special');
        expect(getPeriodKey('whatever')).toBe('special');
    });
});

describe('getNextReset', () => {
    const now = at('2026-05-19T08:30:00Z'); // a Tuesday

    test('daily → strictly future, next calendar day at local midnight', () => {
        const r = new Date(getNextReset('daily', now));
        expect(r.getTime()).toBeGreaterThan(now.getTime());
        expect(r.getHours()).toBe(0);
        expect(r.getMinutes()).toBe(0);
    });

    test('weekly → a future Monday at local midnight', () => {
        const r = new Date(getNextReset('weekly', now));
        expect(r.getTime()).toBeGreaterThan(now.getTime());
        expect(r.getDay()).toBe(1); // Monday
        expect(r.getHours()).toBe(0);
    });

    test('monthly → day 1 of next month at local midnight', () => {
        const r = new Date(getNextReset('monthly', now));
        expect(r.getTime()).toBeGreaterThan(now.getTime());
        expect(r.getDate()).toBe(1);
        expect(r.getHours()).toBe(0);
    });

    test('unknown type → null', () => {
        expect(getNextReset('special', now)).toBeNull();
        expect(getNextReset('nope')).toBeNull();
    });
});
