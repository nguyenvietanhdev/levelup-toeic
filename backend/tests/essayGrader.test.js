/**
 * Chấm bài viết theo tiêu chí IELTS Task 2.
 *
 * Test GỌI HÀM THẬT, không dò chuỗi mã nguồn. Bài học từ chế độ Hội thoại: năm
 * lỗi liên tiếp lọt qua hàng nghìn test vì test chỉ đọc mã nguồn — nó chứng
 * minh code TRÔNG đúng, không chứng minh code CHẠY đúng.
 *
 * Ba chỗ dễ hỏng, đều im lặng:
 *   1. `JSON.parse` trần — model rất hay bọc kết quả trong ```json … ``` dù
 *      prompt đã dặn "chỉ trả JSON". Parse thẳng là ném lỗi, người dùng nhận
 *      "chấm bài thất bại" trong khi AI đã trả lời ĐÚNG.
 *   2. Không kẹp band — AI trả 7.3 hoặc 8.7, không phải band có thật. Hiện số
 *      đó lên là nói dối về độ chính xác của thứ vốn chỉ là ước lượng.
 *   3. Tính band tổng sai luật — IELTS làm tròn về 0.5 gần nhất, không phải làm
 *      tròn xuống.
 */
const {
    parseJson, clampBand, overallBand, countWords, CRITERIA, MIN_WORDS, MAX_WORDS,
} = require('../services/essayGrader');

describe('đọc JSON từ phản hồi AI', () => {
    test('JSON trần', () => {
        expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    });

    test('bọc trong ```json — dạng model hay trả nhất', () => {
        expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    });

    test('bọc trong ``` không ghi ngôn ngữ', () => {
        expect(parseJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
    });

    test('có câu dẫn trước JSON', () => {
        // "Here is the assessment:" — model thêm dù đã dặn đừng.
        expect(parseJson('Here is the assessment:\n{"a":1}')).toEqual({ a: 1 });
    });

    test('có chữ ở cả hai đầu', () => {
        expect(parseJson('Result: {"a":1} Hope this helps!')).toEqual({ a: 1 });
    });

    test('rác hoàn toàn thì trả null, KHÔNG ném', () => {
        // Ném thì sập cả request; trả null để chỗ gọi báo lỗi tử tế.
        expect(parseJson('không phải json')).toBeNull();
        expect(parseJson('')).toBeNull();
        expect(parseJson(null)).toBeNull();
    });
});

describe('kẹp band về thang IELTS', () => {
    test('làm tròn về 0.5 gần nhất', () => {
        expect(clampBand(7.3)).toBe(7.5);
        expect(clampBand(7.2)).toBe(7);
        expect(clampBand(6.75)).toBe(7);
        expect(clampBand(8.7)).toBe(8.5);
    });

    test('chặn ngoài thang 0–9', () => {
        expect(clampBand(12)).toBe(9);
        expect(clampBand(-3)).toBe(0);
    });

    test('giá trị hỏng về 0, không thành NaN', () => {
        // NaN lọt xuống là giao diện hiện "NaN" — trông như app vỡ.
        expect(clampBand('abc')).toBe(0);
        expect(clampBand(undefined)).toBe(0);
        expect(clampBand(null)).toBe(0);
    });

    test('band hợp lệ giữ nguyên', () => {
        expect(clampBand(6.5)).toBe(6.5);
        expect(clampBand(9)).toBe(9);
    });
});

describe('band tổng — theo đúng luật IELTS', () => {
    const mk = (a, b, c, d) => ({
        taskResponse: a, coherence: b, lexical: c, grammar: d,
    });

    test('bốn band bằng nhau', () => {
        expect(overallBand(mk(7, 7, 7, 7))).toBe(7);
    });

    test('trung bình .25 → làm tròn LÊN 0.5 (luật IELTS)', () => {
        // 6+6+6+7 = 25/4 = 6.25 → 6.5. Làm tròn xuống là chấm thấp hơn thật.
        expect(overallBand(mk(6, 6, 6, 7))).toBe(6.5);
    });

    test('trung bình .125 → về band gần nhất', () => {
        // 6+6+6+6.5 = 24.5/4 = 6.125 → 6.0
        expect(overallBand(mk(6, 6, 6, 6.5))).toBe(6);
    });

    test('thiếu tiêu chí thì tính là 0, không sập', () => {
        expect(overallBand({ taskResponse: 8 })).toBe(2);
    });

    test('object rỗng → 0', () => {
        expect(overallBand({})).toBe(0);
        expect(overallBand()).toBe(0);
    });
});

describe('đếm từ', () => {
    test('đếm đúng', () => {
        expect(countWords('one two three')).toBe(3);
    });

    test('bỏ khoảng trắng thừa và xuống dòng', () => {
        expect(countWords('  one   two \n\n three  ')).toBe(3);
    });

    test('rỗng là 0, KHÔNG phải 1', () => {
        // `''.split(/\s+/)` cho `['']` — không lọc thì bài trống đếm ra 1 từ và
        // lọt qua ngưỡng tối thiểu.
        expect(countWords('')).toBe(0);
        expect(countWords('   ')).toBe(0);
        expect(countWords(null)).toBe(0);
    });
});

describe('hằng số theo chuẩn thi thật', () => {
    test('đủ bốn tiêu chí chính thức', () => {
        expect(CRITERIA).toHaveLength(4);
        const keys = CRITERIA.map((c) => c.key);
        expect(keys).toEqual(['taskResponse', 'coherence', 'lexical', 'grammar']);
    });

    test('mỗi tiêu chí có nhãn tiếng Việt', () => {
        // Người học Việt Nam đọc "Lexical Resource" không hiểu ngay là gì.
        for (const c of CRITERIA) expect(c.vi).toBeTruthy();
    });

    test('ngưỡng tối thiểu đúng quy định Task 2', () => {
        expect(MIN_WORDS).toBe(250);
    });

    test('có trần độ dài — chặn nhồi prompt', () => {
        expect(MAX_WORDS).toBeGreaterThan(MIN_WORDS);
        expect(MAX_WORDS).toBeLessThanOrEqual(1500);
    });
});
