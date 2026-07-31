/**
 * Smoke test — TOEIC attempt scoring (the exam-result money path).
 *
 * calculateScores() lives in the ToeicAttempt model (not the controller),
 * so there's nothing to extract — but it's untested and a bug here means
 * users get wrong exam scores. Locked here with ZERO production change
 * (method is async but does no DB I/O; model builds offline).
 *
 * Expectations are DERIVED from the documented formulas, not guessed:
 *   - full-test     -> convertToToeicScore(section, correct)  (table: 0-4=>5, 5=>25)
 *   - mini-part type -> round(correct/total * 495), min 5
 *   - other types    -> same scaled formula as mini-part
 *   - totalScore      = listeningScore + readingScore
 */
const ToeicAttempt = require('../models/ToeicAttempt');

const IDS = { userId: '507f1f77bcf86cd799439011', testId: '507f1f77bcf86cd799439012' };

const ans = (partNumber, isCorrect, userAnswer = isCorrect ? 'A' : '', timeSpent = 1000) =>
    ({ partNumber, isCorrect, userAnswer, timeSpent });

const attempt = (testType, totalQuestions, answers) =>
    new ToeicAttempt({ ...IDS, testType, totalQuestions, answers });

describe('ToeicAttempt.calculateScores — overall stats', () => {
    test('correct/wrong/skipped/accuracy from answers', async () => {
        const a = attempt('full-test', 4, [
            ans(1, true), ans(1, false, 'B'), ans(5, true), ans(7, false, ''), // last = skipped
        ]);
        await a.calculateScores();
        expect(a.correctAnswers).toBe(2);
        expect(a.wrongAnswers).toBe(1);   // wrong with an answer
        expect(a.skippedAnswers).toBe(1); // no userAnswer
        expect(a.accuracy).toBe(50);      // round(2/4*100)
    });

    test('part grouping: ≤4 listening, ≥5 reading, per-part accuracy', async () => {
        const a = attempt('full-test', 3, [ans(1, true), ans(2, false, 'B'), ans(5, true)]);
        await a.calculateScores();
        const byPart = Object.fromEntries(a.partScores.map(p => [p.partNumber, p]));
        expect(byPart[1].accuracy).toBe(100);
        expect(byPart[2].accuracy).toBe(0);
        expect(byPart[5].totalQuestions).toBe(1);
    });
});

describe('full-test → standard conversion table', () => {
    test('5 listening-correct → 25; 0 reading-correct → 5; total = 30', async () => {
        const a = attempt('full-test', 6, [
            ans(1, true), ans(1, true), ans(2, true), ans(3, true), ans(4, true), // 5 L correct
            ans(5, false, 'X'),                                                   // 0 R correct
        ]);
        await a.calculateScores();
        expect(a.listeningScore).toBe(25); // convertToToeicScore('listening',5)
        expect(a.readingScore).toBe(5);    // convertToToeicScore('reading',0)
        expect(a.totalScore).toBe(30);
    });
});

describe('mini-part* → scaled = round(correct/total*495), min 5', () => {
    test('listening 3/3 (100%) → 495; no reading → 5; total 500', async () => {
        const a = attempt('mini-part1', 3, [ans(1, true), ans(1, true), ans(2, true)]);
        await a.calculateScores();
        expect(a.listeningScore).toBe(495);
        expect(a.readingScore).toBe(5);   // readingTotal === 0
        expect(a.totalScore).toBe(500);
    });

    test('reading 1/4 (25%) → round(0.25*495)=124', async () => {
        const a = attempt('mini-part5', 4, [
            ans(5, true), ans(5, false, 'B'), ans(6, false, 'C'), ans(7, false, 'D'),
        ]);
        await a.calculateScores();
        expect(a.readingScore).toBe(124);
        expect(a.listeningScore).toBe(5); // listeningTotal === 0
    });
});

describe('other test types use the same scaled formula', () => {
    test("'listening' type: all wrong → floor 5 each", async () => {
        const a = attempt('listening', 2, [ans(1, false, 'X'), ans(2, false, 'Y')]);
        await a.calculateScores();
        expect(a.listeningScore).toBe(5); // 0% → max(5, 0)
        expect(a.readingScore).toBe(5);   // no reading parts
        expect(a.totalScore).toBe(10);
    });
});
