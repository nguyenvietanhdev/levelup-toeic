/**
 * Thứ tự câu hỏi của một đề.
 *
 * `part.questions` lưu theo thứ tự ADMIN THÊM VÀO, không phải thứ tự thi. Đề
 * Full Test thật từng có 43 chỗ nhảy lùi (Part 1 ra 2,4,1,3,5,6 rồi nhảy sang
 * câu 22). Người thi mất phương hướng, và tệ hơn: đáp án đã lưu được map lại
 * theo VỊ TRÍ trong mảng, nên thứ tự lệch giữa "bắt đầu" và "tiếp tục" là chấm
 * nhầm bài. Không có DB ở đây — hàm thuần.
 */
const { buildTestQuestions } = require('../services/questionSetService');

// Một "màn" tối giản: chỉ cần part + questions[].number là đủ cho thứ tự.
const set = (part, numbers) => ({
    _id: `set-${part}-${numbers[0]}`,
    part,
    questions: numbers.map(n => ({ _id: `q${n}`, number: n, options: [] })),
});

const numbersOf = (test) => buildTestQuestions(test).map(q => q.globalQuestionNumber);

describe('buildTestQuestions — thứ tự thi', () => {
    test('màn bị xáo trong một part → sắp lại đúng số câu', () => {
        const test = {
            testType: 'mini-part5',
            parts: [{ partNumber: 5, questions: [set(5, [103]), set(5, [101]), set(5, [102])] }],
        };
        expect(numbersOf(test)).toEqual([101, 102, 103]);
    });

    test('part bị xáo trong mảng → sắp theo partNumber', () => {
        const test = {
            testType: 'full-test',
            parts: [
                { partNumber: 2, questions: [set(2, [7])] },
                { partNumber: 1, questions: [set(1, [1])] },
            ],
        };
        expect(numbersOf(test)).toEqual([1, 7]);
    });

    test('màn NHÓM (Part 3) giữ nguyên khối, không bị xé lẻ', () => {
        const test = {
            testType: 'full-test',
            parts: [{
                partNumber: 3,
                questions: [set(3, [35, 36, 37]), set(3, [32, 33, 34]), set(3, [38, 39, 40])],
            }],
        };
        expect(numbersOf(test)).toEqual([32, 33, 34, 35, 36, 37, 38, 39, 40]);

        // Cùng groupId phải nằm liền nhau — điều kiện để runner gộp một màn.
        const flat = buildTestQuestions(test);
        const seen = new Map();
        flat.forEach((q, i) => {
            if (!seen.has(q.groupId)) seen.set(q.groupId, []);
            seen.get(q.groupId).push(i);
        });
        for (const idx of seen.values()) {
            expect(idx[idx.length - 1] - idx[0]).toBe(idx.length - 1);
        }
    });

    test('câu trong cùng một màn cũng được sắp theo số', () => {
        const test = {
            testType: 'full-test',
            parts: [{ partNumber: 3, questions: [set(3, [34, 32, 33])] }],
        };
        expect(numbersOf(test)).toEqual([32, 33, 34]);
    });

    test('tham chiếu hỏng (màn đã bị xoá) bị bỏ qua, không làm vỡ đề', () => {
        const test = {
            testType: 'mini-part5',
            parts: [{ partNumber: 5, questions: [null, set(5, [102]), undefined, set(5, [101])] }],
        };
        expect(numbersOf(test)).toEqual([101, 102]);
    });

    test('màn THIẾU số câu bị dồn xuống cuối, giữ nguyên thứ tự cũ (không xáo bừa)', () => {
        const noNum = { _id: 'set-x', part: 5, questions: [{ _id: 'qx', options: [] }] };
        const test = {
            testType: 'mini-part5',
            parts: [{ partNumber: 5, questions: [noNum, set(5, [101])] }],
        };
        const flat = buildTestQuestions(test);
        expect(flat[0].globalQuestionNumber).toBe(101);
        expect(flat).toHaveLength(2);
    });

    test('chế độ thường KHÔNG lộ đáp án; fill-blank thì giữ', () => {
        const withAns = {
            _id: 's', part: 5,
            questions: [{ _id: 'q', number: 101, correctAnswer: 'B', options: [] }],
        };
        const test = { testType: 'mini-part5', parts: [{ partNumber: 5, questions: [withAns] }] };

        expect(buildTestQuestions(test)[0].correctAnswer).toBeUndefined();
        expect(buildTestQuestions(test, { includeAnswers: true })[0].correctAnswer).toBe('B');
    });

    test('section chia đúng: Part 1-4 nghe, Part 5-7 đọc', () => {
        const test = {
            testType: 'full-test',
            parts: [
                { partNumber: 4, questions: [set(4, [71])] },
                { partNumber: 5, questions: [set(5, [101])] },
            ],
        };
        const flat = buildTestQuestions(test);
        expect(flat.map(q => q.section)).toEqual(['listening', 'reading']);
    });
});
