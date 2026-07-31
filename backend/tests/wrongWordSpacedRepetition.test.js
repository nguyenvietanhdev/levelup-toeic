/**
 * Smoke test — WrongWord spaced-repetition (SM-2) algorithm.
 *
 * The SR logic lives in WrongWord model instance methods (not the
 * controller), so there is nothing to extract — but it's a learning-
 * critical, previously-untested path. These tests lock its behaviour
 * with ZERO production change (pure: methods only touch `this` + Date;
 * the model can be constructed offline without a DB connection).
 */
const WrongWord = require('../models/WrongWord');

const make = () => new WrongWord({
    userId: '507f1f77bcf86cd799439011',
    wordId: 'w1', en: 'arrange', vn: 'sắp xếp',
});

const daysBetween = (a, b) =>
    Math.round((b.getTime() - a.getTime()) / 86400000);

describe('WrongWord SM-2 — recordCorrect', () => {
    test('interval schedule 1 → 6 → round(prev*EF); EF caps at 2.5', () => {
        const w = make(); // EF=2.5, rep=0, interval=1, mastery=0
        w.recordCorrect();                       // rep1
        expect(w.repetition).toBe(1);
        expect(w.interval).toBe(1);
        expect(w.easinessFactor).toBeCloseTo(2.5);
        expect(w.masteryLevel).toBe(1);

        w.recordCorrect();                       // rep2
        expect(w.interval).toBe(6);

        w.recordCorrect();                       // rep3 → round(6*2.5)=15
        expect(w.interval).toBe(15);

        w.recordCorrect();                       // rep4 → round(15*2.5)=38
        expect(w.interval).toBe(38);
    });

    test('5 correct in a row → mastered (mastery>=5 & rep>=3)', () => {
        const w = make();
        for (let i = 0; i < 5; i++) w.recordCorrect();
        expect(w.masteryLevel).toBe(5);
        expect(w.repetition).toBe(5);
        expect(w.status).toBe('mastered');
    });

    test('nextReviewDate moves `interval` days into the future', () => {
        const w = make();
        w.recordCorrect();
        expect(w.nextReviewDate.getTime()).toBeGreaterThan(Date.now());
        expect(daysBetween(new Date(), w.nextReviewDate)).toBe(w.interval);
    });
});

describe('WrongWord SM-2 — recordWrong', () => {
    test('resets repetition/interval, lowers EF (floor 1.3) & mastery, status active', () => {
        const w = make();
        for (let i = 0; i < 4; i++) w.recordCorrect(); // build up mastery/rep
        const masteryBefore = w.masteryLevel;

        w.recordWrong();
        expect(w.repetition).toBe(0);
        expect(w.interval).toBe(1);
        expect(w.easinessFactor).toBeCloseTo(2.3);          // 2.5 - 0.2
        expect(w.masteryLevel).toBe(masteryBefore - 1);
        expect(w.status).toBe('active');
        expect(w.wrongCount).toBeGreaterThanOrEqual(2);
    });

    test('EF never drops below 1.3; mastery never below 0', () => {
        const w = make();
        for (let i = 0; i < 12; i++) w.recordWrong();
        expect(w.easinessFactor).toBeGreaterThanOrEqual(1.3);
        expect(w.masteryLevel).toBe(0);
    });

    test('priorityScore is a finite number after updates', () => {
        const w = make();
        w.recordWrong();
        expect(Number.isFinite(w.priorityScore)).toBe(true);
    });
});
