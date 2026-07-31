import { describe, test, expect, vi } from 'vitest';

// GameState kéo theo cả Storage/EventBus — test này chỉ cần settings rỗng.
vi.mock('@game/state.js', () => ({ GameState: { state: { settings: {} } } }));

const {
    FULL_TEST_LISTENING_SECONDS,
    FULL_TEST_READING_SECONDS,
    isFullTestType,
    buildFullTestReadingPlan,
} = await import('./toeicPartTime.js');

const mkQuestions = (counts) =>
    Object.entries(counts).flatMap(([part, n]) =>
        Array.from({ length: n }, () => ({ part: Number(part) })),
    );

describe('Full Test — giờ chuẩn ETS', () => {
    test('45 phút Nghe, 75 phút Đọc', () => {
        expect(FULL_TEST_LISTENING_SECONDS).toBe(2700);
        expect(FULL_TEST_READING_SECONDS).toBe(4500);
        // Tổng đúng 120' như đề thi thật.
        expect(FULL_TEST_LISTENING_SECONDS + FULL_TEST_READING_SECONDS).toBe(7200);
    });

    test('nhận diện được cả "full" lẫn "full-test"', () => {
        expect(isFullTestType({ testType: 'full' })).toBe(true);
        expect(isFullTestType({ testType: 'full-test' })).toBe(true);
        expect(isFullTestType({ testType: 'mini' })).toBe(false);
        expect(isFullTestType(null)).toBe(false);
    });
});

describe('buildFullTestReadingPlan', () => {
    const fullTest = mkQuestions({ 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 });

    test('chia đúng ngân sách 75\' — KHÔNG trừ phần Nghe', () => {
        const plan = buildFullTestReadingPlan(fullTest);
        const readingCount = { 5: 30, 6: 16, 7: 54 };
        const total = Object.entries(readingCount)
            .reduce((sum, [part, n]) => sum + plan[part] * n, 0);
        // Chỉ hụt do làm tròn xuống + khoảng chuyển câu, không hụt cả phần Nghe.
        expect(total).toBeLessThanOrEqual(FULL_TEST_READING_SECONDS);
        expect(total).toBeGreaterThan(FULL_TEST_READING_SECONDS * 0.9);
    });

    test('câu Part 7 nặng hơn nên được nhiều giờ hơn Part 5', () => {
        const plan = buildFullTestReadingPlan(fullTest);
        expect(plan[7]).toBeGreaterThan(plan[6]);
        expect(plan[6]).toBeGreaterThan(plan[5]);
    });

    test('đề không có Part Đọc → null', () => {
        expect(buildFullTestReadingPlan(mkQuestions({ 1: 6, 2: 25 }))).toBeNull();
        expect(buildFullTestReadingPlan([])).toBeNull();
    });
});
