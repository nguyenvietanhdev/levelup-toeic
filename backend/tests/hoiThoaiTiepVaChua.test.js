/**
 * Hội thoại: vào lại nói tiếp phiên đang dở, và chữa từng câu sau khi kết thúc.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Chữa một câu người học KHÔNG nói (AI trích bịa) → gạch chân chỗ không tồn tại.
 *   2. Mở phiên mới mà phiên dở cũ vẫn "active" → mời làm tiếp nhầm phiên cũ.
 *   3. Phiên dở của Chat bị mời làm tiếp ở Hội thoại giọng nói (và ngược lại).
 *   4. `/dang-do` đứng sau `/:id` → bị nuốt thành "id = dang-do".
 */
const { docChuaTungCau, parseGrading, buildGradingMessages } = require('../services/conversationGrader');
const { readFileSync } = require('fs');
const { join } = require('path');

const CAU = ['I am agree with you.', 'Yesterday I go to the market.'];

describe('chữa từng câu', () => {
    test('trỏ đúng lượt nói của người học; bỏ trích dẫn bịa, trùng, thiếu giải thích', () => {
        const r = docChuaTungCau([
            { said: 'I go', better: 'I went', issue: 'Quá khứ', type: 'tense', level: 'error' },
            { said: 'am agree', better: 'agree', issue: 'Thừa am', type: 'Agreement' },
            { said: 'không có câu này', better: 'x', issue: 'bịa' },
            { said: 'I GO', better: 'I went', issue: 'trùng' },
            { said: 'with you', better: '', issue: '' },
        ], CAU);
        expect(r).toEqual([
            { luot: 1, said: 'I go', better: 'I went', issue: 'Quá khứ', loai: 'tense', muc: 'loi' },
            { luot: 0, said: 'am agree', better: 'agree', issue: 'Thừa am', loai: 'agreement', muc: 'loi' },
        ]);
    });

    test('tối đa 6 mục; không có câu người học → []', () => {
        const tu = ['I', 'am', 'agree', 'with', 'you', 'Yesterday', 'go', 'to', 'the'];
        const nhieu = tu.map((t, i) => ({ said: t, issue: `x${i}` }));
        expect(docChuaTungCau(nhieu, CAU)).toHaveLength(6);
        expect(docChuaTungCau([{ said: 'I', issue: 'x' }], [])).toEqual([]);
    });

    test('parseGrading gắn corrections khi biết các lượt người học', () => {
        const raw = JSON.stringify({
            criteria: [{ key: 'ro_y', score: 6, comment: 'ok' }], summary: 's',
            corrections: [{ said: 'I go', better: 'I went', issue: 'Quá khứ', type: 'tense', level: 'error' }],
        });
        const r = parseGrading(raw, 'giaotiep', 'en', 'medium', CAU);
        expect(r.corrections).toHaveLength(1);
        expect(parseGrading(raw, 'giaotiep').corrections).toEqual([]);
    });

    test('prompt yêu cầu trích NGUYÊN VĂN và cách nói thay thế; vẫn giữ luật văn nói', () => {
        const [sys] = buildGradingMessages({ rubric: 'giaotiep', lang: 'en', track: 'en', level: 'medium', turns: [{ role: 'user', content: 'hi' }] });
        expect(sys.content).toMatch(/"said": the exact words copied from ONE learner line/);
        expect(sys.content).toMatch(/do not correct accepted spoken forms/);
        expect(sys.content).toMatch(/"corrections":\[/);
    });
});

describe('làm tiếp phiên đang dở', () => {
    const ctrl = readFileSync(join(__dirname, '..', 'controllers', 'conversationController.js'), 'utf8');
    const route = readFileSync(join(__dirname, '..', 'routes', 'conversation.js'), 'utf8');

    test('route /dang-do khai TRƯỚC /:id', () => {
        expect(route.indexOf("router.get('/dang-do'")).toBeGreaterThan(-1);
        expect(route.indexOf("router.get('/dang-do'")).toBeLessThan(route.indexOf("router.get('/:id'"));
        expect(route).toMatch(/router\.post\('\/:id\/bo', ctrl\.bo\)/);
    });

    test('tách Chat và Giọng nói; chỉ phiên còn active và đã có lượt', () => {
        const than = ctrl.slice(ctrl.indexOf('exports.dangDo'), ctrl.indexOf('exports.bo'));
        expect(than).toMatch(/status: 'active',\s*voice: voice \? true : \{ \$ne: true \},\s*'turns\.0': \{ \$exists: true \}/);
        expect(than).toMatch(/\.sort\(\{ updatedAt: -1 \}\)/);
    });

    test('mở phiên mới thì bỏ các phiên dở cũ cùng kiểu', () => {
        expect(ctrl).toMatch(/Conversation\.updateMany\(\s*\{ userId: req\.user\.id, status: 'active', voice: voice \? true : \{ \$ne: true \} \},\s*\{ \$set: \{ status: 'abandoned' \} \}/);
    });

    test('bỏ phiên: chỉ phiên của chính mình, đang active', () => {
        const than = ctrl.slice(ctrl.indexOf('exports.bo'));
        expect(than).toMatch(/\{ _id: req\.params\.id, userId: req\.user\.id, status: 'active' \}/);
    });
});
