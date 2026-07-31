/**
 * Unit test cho việc nạp BỘ ĐÁP ÁN (toàn hàm thuần, không gọi AI, không chạm DB):
 * đọc dải câu, đọc thứ admin dán vào, và đối chiếu với đề.
 *
 * Chốt lại điểm dễ hỏng nhất: số câu ngoài dải. Giữ lại những số đó là ghi đè
 * nhầm sang phần đề khác — hỏng dữ liệu mà không ai biết.
 */
const { parseRange, normalizeAnswers, parseAnswerText } = require('../services/answerKeyParser');
const { compareAnswers } = require('../controllers/answerKeyController');

describe('parseRange', () => {
    test('đọc được các kiểu gạch nối thường gặp', () => {
        expect(parseRange('1-100')).toEqual({ from: 1, to: 100 });
        expect(parseRange('101 – 200')).toEqual({ from: 101, to: 200 });
        expect(parseRange('1,50')).toEqual({ from: 1, to: 50 });
    });

    test('nhập một số = đúng câu đó', () => {
        expect(parseRange('7')).toEqual({ from: 7, to: 7 });
    });

    test('từ chối dải vô lý', () => {
        expect(parseRange('100-1')).toBeNull();   // ngược
        expect(parseRange('0-50')).toBeNull();    // câu 0
        expect(parseRange('1-500')).toBeNull();   // quá 200
        expect(parseRange('abc')).toBeNull();
        expect(parseRange('')).toBeNull();
    });
});

describe('normalizeAnswers', () => {
    const range = { from: 101, to: 103 };

    test('giữ đáp án hợp lệ trong dải, chữ thường cũng nhận', () => {
        const { answers } = normalizeAnswers({ 101: 'A', 102: 'b', 103: 'C' }, range);
        expect(answers).toEqual({ 101: 'A', 102: 'B', 103: 'C' });
    });

    test('LOẠI câu ngoài dải — tránh ghi đè nhầm phần đề khác', () => {
        const { answers, skipped } = normalizeAnswers({ 101: 'A', 55: 'B', 199: 'C' }, range);
        expect(answers).toEqual({ 101: 'A' });
        expect(skipped.map(s => s.number)).toEqual([55, 199]);
        expect(skipped[0].reason).toMatch(/ngoài dải/);
    });

    test('loại giá trị không phải A-D (AI đọc mờ)', () => {
        const { answers, skipped } = normalizeAnswers({ 101: 'E', 102: '', 103: 'D' }, range);
        expect(answers).toEqual({ 103: 'D' });
        expect(skipped).toHaveLength(2);
    });

    test('không có dải thì không lọc theo dải', () => {
        const { answers } = normalizeAnswers({ 1: 'A', 200: 'D' }, null);
        expect(answers).toEqual({ 1: 'A', 200: 'D' });
    });
});

describe('parseAnswerText (dán tay — đường duy nhất nạp đáp án)', () => {
    test('object JSON — dạng thường dùng nhất', () => {
        const r = parseAnswerText('{"101":"A","102":"c"}', null);
        expect(r.answers).toEqual({ 101: 'A', 102: 'C' });
        expect(r.format).toBe('object');
    });

    test('nhận cả object JS sẵn (client gửi JSON thật, không phải chuỗi)', () => {
        expect(parseAnswerText({ 1: 'A', 2: 'B' }, null).answers).toEqual({ 1: 'A', 2: 'B' });
    });

    test('bóc lớp bọc {"answers": {...}}', () => {
        expect(parseAnswerText('{"answers":{"5":"D"}}', null).answers).toEqual({ 5: 'D' });
    });

    test('mảng chữ cái đánh số từ ĐẦU DẢI — dán riêng phần 101-200 không lệch số câu', () => {
        const r = parseAnswerText('["A","C","B"]', { from: 101, to: 200 });
        expect(r.answers).toEqual({ 101: 'A', 102: 'C', 103: 'B' });
        expect(r.format).toBe('array');
    });

    test('mảng chữ cái không có dải thì đánh số từ câu 1', () => {
        expect(parseAnswerText('["A","B"]', null).answers).toEqual({ 1: 'A', 2: 'B' });
    });

    test('mảng object, tên trường nào cũng nhận', () => {
        const r = parseAnswerText('[{"number":101,"answer":"A"},{"q":102,"ans":"D"}]', null);
        expect(r.answers).toEqual({ 101: 'A', 102: 'D' });
        expect(r.format).toBe('array-object');
    });

    // Dán thẳng từ khung chat AI: hay dính rào ```json và lời dẫn hai đầu.
    test('gỡ được rào ```json quanh kết quả', () => {
        const r = parseAnswerText('```json\n{"101":"A","102":"B"}\n```', null);
        expect(r.answers).toEqual({ 101: 'A', 102: 'B' });
        expect(r.format).toBe('object');
    });

    test('gỡ được lời dẫn của AI hai đầu', () => {
        const r = parseAnswerText('Đây là kết quả nhé:\n{"101":"A"}\nBạn cần gì nữa không?', null);
        expect(r.answers).toEqual({ 101: 'A' });
    });

    test('không phải JSON thì vớt cặp số–chữ từ text tự do', () => {
        const r = parseAnswerText('101. A\n102) C\n103 - B', null);
        expect(r.answers).toEqual({ 101: 'A', 102: 'C', 103: 'B' });
        expect(r.format).toBe('text');
    });

    test('text tự do không đọc nhầm chữ cái mở đầu một TỪ', () => {
        // "102. Answer" phải bị bỏ qua chứ không được hiểu thành 102 → A.
        const r = parseAnswerText('101. B\n102. Answer chưa có', null);
        expect(r.answers).toEqual({ 101: 'B' });
    });

    test('LOẠI câu ngoài dải — dán nhầm phần khác không ghi đè lung tung', () => {
        const r = parseAnswerText('{"101":"A","55":"B"}', { from: 101, to: 200 });
        expect(r.answers).toEqual({ 101: 'A' });
        expect(r.skipped[0].reason).toMatch(/ngoài dải/);
    });

    test('rỗng / rác / không còn đáp án hợp lệ → lỗi 400 dễ hiểu, không phải 500', () => {
        expect(() => parseAnswerText('', null)).toThrow(/Chưa nhập/);
        expect(() => parseAnswerText('không có gì ở đây', null)).toThrow(/Không đọc được/);
        const err = (() => { try { parseAnswerText('{"101":"Z"}', null); } catch (e) { return e; } })();
        expect(err.statusCode).toBe(400);
        expect(err.message).toMatch(/A\/B\/C\/D/);
    });
});

describe('compareAnswers', () => {
    const questions = [
        { setId: 's1', index: 0, part: 5, number: 101, correctAnswer: 'A' },
        { setId: 's1', index: 1, part: 5, number: 102, correctAnswer: 'B' },
        { setId: 's2', index: 0, part: 5, number: 103, correctAnswer: 'C' },
    ];

    test('tách đúng 4 nhóm: khớp / lệch / đề chưa có / chưa quét', () => {
        const key = { 101: 'A', 102: 'D', 999: 'B' }; // 103 chưa quét
        const r = compareAnswers(key, questions);

        expect(r.matched.map(x => x.number)).toEqual([101]);
        expect(r.mismatched).toHaveLength(1);
        expect(r.mismatched[0]).toMatchObject({ number: 102, current: 'B', expected: 'D' });
        expect(r.notInTest.map(x => x.number)).toEqual([999]);
        expect(r.notInKey.map(x => x.number)).toEqual([103]);
    });

    test('câu lệch mang theo setId + index để ghi ngược đúng chỗ', () => {
        const r = compareAnswers({ 103: 'A' }, questions);
        expect(r.mismatched[0]).toMatchObject({ setId: 's2', index: 0 });
    });

    test('bộ đáp án rỗng → không có gì lệch, mọi câu là chưa quét', () => {
        const r = compareAnswers({}, questions);
        expect(r.mismatched).toHaveLength(0);
        expect(r.notInKey).toHaveLength(3);
    });
});
