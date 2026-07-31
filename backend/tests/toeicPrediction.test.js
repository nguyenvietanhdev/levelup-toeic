/**
 * Ước lượng điểm TOEIC từ lịch sử bài làm.
 *
 * Điểm mấu chốt cần khoá: mini test và full test KHÔNG cùng đơn vị. Mini test
 * lưu `readingScore` = %đúng × 495, nên trộn thẳng vào bình quân với điểm full
 * test là bịa số. Test dưới đây chốt việc mini chỉ được dùng qua ĐỘ CHÍNH XÁC
 * từng Part. Hàm thuần, không DB.
 */
const { predictToeicScore, partAccuracy, projectSection, PART_COUNTS } =
    require('../services/toeicPrediction');

/** Bài full test với số câu đúng mỗi section (mỗi section 100 câu). */
const fullTest = (totalScore, listeningScore, readingScore) => ({
    testType: 'full-test',
    totalScore, listeningScore, readingScore,
    partScores: [
        { partNumber: 1, correctAnswers: 5, totalQuestions: 6 },
        { partNumber: 5, correctAnswers: 20, totalQuestions: 30 },
    ],
});

/** Bài mini một Part với tỉ lệ đúng cho trước. */
const mini = (part, correct, total) => ({
    testType: `mini-part${part}`,
    totalScore: 0,
    listeningScore: part <= 4 ? Math.round((correct / total) * 495) : 5,
    readingScore: part >= 5 ? Math.round((correct / total) * 495) : 5,
    partScores: [{ partNumber: part, correctAnswers: correct, totalQuestions: total }],
});

describe('predictToeicScore — chưa đủ dữ liệu', () => {
    test('không có bài nào → null', () => {
        expect(predictToeicScore([])).toBeNull();
        expect(predictToeicScore()).toBeNull();
    });

    test('chỉ có Part Đọc → báo thiếu phần Nghe, KHÔNG đoán bừa', () => {
        const r = predictToeicScore([mini(5, 20, 30), mini(7, 30, 54)]);
        expect(r.enough).toBe(false);
        expect(r.reason).toMatch(/Nghe/);
        expect(r.listening).toBeNull();
        expect(r.reading).toBeGreaterThan(0);
    });

    test('chỉ có Part Nghe → báo thiếu phần Đọc', () => {
        const r = predictToeicScore([mini(1, 5, 6), mini(2, 20, 25)]);
        expect(r.enough).toBe(false);
        expect(r.reason).toMatch(/Đọc/);
        expect(r.reading).toBeNull();
    });
});

describe('predictToeicScore — có full test', () => {
    test('một đề đầy đủ → dùng thẳng điểm đó, khoảng rộng vì ít dữ liệu', () => {
        const r = predictToeicScore([fullTest(700, 380, 320)]);
        expect(r.enough).toBe(true);
        expect(r.basis).toBe('full-test');
        expect(r.predicted.mid).toBe(700);
        expect(r.confidence).toBe('thap');
        expect(r.predicted.high - r.predicted.low).toBe(120); // ±60
    });

    test('nhiều đề → bài MỚI nặng hơn bài cũ', () => {
        // Mới nhất trước. Bình quân thô = 700, nhưng bài mới nhất là 800.
        const r = predictToeicScore([fullTest(800, 420, 380), fullTest(700, 380, 320), fullTest(600, 320, 280)]);
        expect(r.average).toBe(700);              // bình quân thô, không trọng số
        expect(r.predicted.mid).toBeGreaterThan(700); // có trọng số → nghiêng về bài mới
        expect(r.best).toBe(800);
        expect(r.confidence).toBe('cao');
    });

    test('điểm luôn là bội của 5 và nằm trong 10..990', () => {
        const r = predictToeicScore([fullTest(985, 495, 490), fullTest(990, 495, 495)]);
        for (const v of [r.predicted.low, r.predicted.mid, r.predicted.high]) {
            expect(v % 5).toBe(0);
            expect(v).toBeGreaterThanOrEqual(10);
            expect(v).toBeLessThanOrEqual(990);
        }
    });

    test('kết quả trồi sụt mạnh → khoảng ước lượng rộng ra', () => {
        const steady = predictToeicScore([fullTest(700, 350, 350), fullTest(700, 350, 350), fullTest(700, 350, 350)]);
        const swingy = predictToeicScore([fullTest(900, 450, 450), fullTest(500, 250, 250), fullTest(700, 350, 350)]);
        const width = (r) => r.predicted.high - r.predicted.low;
        expect(width(swingy)).toBeGreaterThan(width(steady));
    });

    test('có full test thì KHÔNG để mini test kéo lệch điểm', () => {
        // Mini Part 5 làm đúng 100% → readingScore = 495, nếu bị trộn vào bình
        // quân sẽ đẩy dự đoán lên vô lý.
        const only = predictToeicScore([fullTest(600, 320, 280)]);
        const mixed = predictToeicScore([fullTest(600, 320, 280), mini(5, 30, 30), mini(5, 30, 30)]);
        expect(mixed.predicted.mid).toBe(only.predicted.mid);
        expect(mixed.basis).toBe('full-test');
    });
});

describe('predictToeicScore — chỉ có mini test', () => {
    test('phủ đủ 7 Part → suy ra được điểm, nhưng đánh dấu nguồn là mini', () => {
        const r = predictToeicScore([
            mini(1, 6, 6), mini(2, 20, 25), mini(3, 30, 39), mini(4, 24, 30),
            mini(5, 24, 30), mini(6, 12, 16), mini(7, 40, 54),
        ]);
        expect(r.enough).toBe(true);
        expect(r.basis).toBe('mini-test');
        expect(r.coverage).toBe(1);
        expect(r.missingParts).toEqual([]);
        expect(r.predicted.mid).toBeGreaterThan(0);
        // Suy gián tiếp thì khoảng phải rộng hơn khi có đề đầy đủ.
        expect(r.predicted.high - r.predicted.low).toBeGreaterThanOrEqual(140);
        expect(r.average).toBeNull();  // chưa làm đề đầy đủ nào
    });

    test('làm đúng hết mọi Part → sát trần 990', () => {
        const r = predictToeicScore([
            mini(1, 6, 6), mini(2, 25, 25), mini(3, 39, 39), mini(4, 30, 30),
            mini(5, 30, 30), mini(6, 16, 16), mini(7, 54, 54),
        ]);
        expect(r.predicted.mid).toBe(990);
    });

    test('thiếu vài Part → vẫn ước được nhưng coverage < 1 và ghi rõ Part thiếu', () => {
        const r = predictToeicScore([mini(2, 20, 25), mini(5, 24, 30)]);
        expect(r.enough).toBe(true);
        expect(r.coverage).toBeLessThan(1);
        expect(r.missingParts).toEqual(expect.arrayContaining([1, 3, 4, 6, 7]));
        expect(r.confidence).toBe('thap');
    });
});

describe('đối chiếu mục tiêu', () => {
    test('chưa đặt mục tiêu → không có trường gap', () => {
        const r = predictToeicScore([fullTest(700, 380, 320)]);
        expect(r.target).toBeNull();
        expect(r.gap).toBeUndefined();
    });

    test('còn cách mục tiêu → gap là số điểm còn thiếu', () => {
        const r = predictToeicScore([fullTest(600, 320, 280)], 800);
        expect(r.target).toBe(800);
        expect(r.gap).toBe(200);
        expect(r.reachedTarget).toBe(false);
    });

    test('đã vượt mục tiêu → gap = 0', () => {
        const r = predictToeicScore([fullTest(850, 430, 420)], 700);
        expect(r.gap).toBe(0);
        expect(r.reachedTarget).toBe(true);
    });

    test('mục tiêu nằm trong khoảng ước lượng → "trong tầm với" dù chưa đạt', () => {
        // 1 bài → khoảng ±60, nên mục tiêu 750 nằm trong tầm của mid 700.
        const r = predictToeicScore([fullTest(700, 380, 320)], 750);
        expect(r.reachedTarget).toBe(false);
        expect(r.withinReach).toBe(true);
    });
});

describe('các hàm phụ', () => {
    test('partAccuracy gộp nhiều bài cùng Part', () => {
        const acc = partAccuracy([mini(5, 15, 30), mini(5, 15, 30)]);
        expect(acc.get(5).accuracy).toBeCloseTo(0.5, 5);
    });

    test('projectSection đoán Part thiếu bằng bình quân theo SỐ CÂU', () => {
        // Chỉ có Part 5 với 50% đúng → Part 6, 7 mượn 50% → 50 câu đúng /100.
        const acc = partAccuracy([mini(5, 15, 30)]);
        const r = projectSection(acc, [5, 6, 7], 'reading');
        expect(r.missing).toEqual([6, 7]);
        expect(r.covered).toBeCloseTo(30 / 100, 5);
        expect(r.score).toBe(require('../utils/toeicScoreConverter').convertToToeicScore('reading', 50));
    });

    test('tổng số câu chuẩn đúng 200', () => {
        expect(Object.values(PART_COUNTS).reduce((a, b) => a + b, 0)).toBe(200);
    });
});
