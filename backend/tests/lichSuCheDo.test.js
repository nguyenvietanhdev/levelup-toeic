/**
 * Lịch sử các chế độ AI: xem lại MỘT bài đã làm (Viết, Dịch, Đọc hiểu, Nghe).
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Quên lọc `userId` → ai đoán được id cũng đọc được bài người khác.
 *   2. `/:id` đặt trước `/history` → "/history" bị coi là một id, trả 400.
 *   3. Nghe trả đoạn gốc của lượt CHƯA chấm → lộ đáp án bài đang nghe.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const doc = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const than = (src, ten) => {
    const i = src.indexOf(`exports.${ten} = `);
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf('\nexports.', i + 1);
    return src.slice(i, j < 0 ? undefined : j);
};

const CHE_DO = [
    ['Viết', 'essayController.js', 'essay.js', 'Essay'],
    ['Dịch', 'translationController.js', 'translation.js', 'Translation'],
    ['Đọc hiểu', 'readingController.js', 'reading.js', 'ReadingAttempt'],
    ['Nghe', 'listeningController.js', 'listening.js', 'ListeningSession'],
];

describe('xem lại một bài: chỉ của chính người học', () => {
    for (const [ten, ctrl, , model] of CHE_DO) {
        test(`${ten}: kiểm id hợp lệ, lọc theo userId, 404 khi không có`, () => {
            const b = than(doc('controllers', ctrl), 'detail');
            expect(b).toMatch(/mongoose\.isValidObjectId\(req\.params\.id\)/);
            expect(b).toMatch(new RegExp(`${model}\\.findOne\\(\\{ _id: req\\.params\\.id, userId: req\\.user\\.id`));
            expect(b).toMatch(/status\(404\)/);
            expect(b).toMatch(/-userId/);
        });
    }
});

describe('thứ tự route: /history (và /mistakes) đứng TRƯỚC /:id', () => {
    for (const [ten, , route] of CHE_DO) {
        test(`${ten}`, () => {
            const r = doc('routes', route);
            const id = r.indexOf("router.get('/:id'");
            expect(id).toBeGreaterThan(-1);
            expect(r.indexOf("router.get('/history'")).toBeLessThan(id);
            if (route === 'translation.js') expect(r.indexOf("router.get('/mistakes'")).toBeLessThan(id);
        });
    }

    test('Nghe: history và detail cần đăng nhập', () => {
        const r = doc('routes', 'listening.js');
        expect(r).toMatch(/router\.get\('\/history', protect, ctrl\.history\)/);
        expect(r).toMatch(/router\.get\('\/:id', protect, ctrl\.detail\)/);
    });
});

describe('Nghe: chỉ lượt ĐÃ CHẤM mới có trong lịch sử', () => {
    const src = doc('controllers', 'listeningController.js');

    test('history chỉ lấy status done, KHÔNG trả đoạn gốc', () => {
        const b = than(src, 'history');
        expect(b).toMatch(/status: 'done'/);
        expect(b).not.toMatch(/passage/);
    });

    test('detail chỉ mở lượt đã chấm, kèm đoạn gốc và từ thiếu/thừa tính lại', () => {
        const b = than(src, 'detail');
        expect(b).toMatch(/status: 'done'/);
        expect(b).toMatch(/\.select\('\+passage/);
        expect(b).toMatch(/chamNghe\(doc\.passage, doc\.typed \|\| ''\)/);
    });
});

describe('Viết, Dịch: trả kèm nhãn tiêu chí để hiện điểm từng mục', () => {
    test('Viết dùng criteriaFor theo ngôn ngữ và kiểu chấm của bài', () => {
        expect(than(doc('controllers', 'essayController.js'), 'detail')).toMatch(/criteriaFor\(doc\.lang, doc\.rubric\)/);
    });
    test('Dịch dùng CRITERIA của bộ chấm dịch', () => {
        expect(than(doc('controllers', 'translationController.js'), 'detail')).toMatch(/translationGrader'\)\.CRITERIA/);
    });
});
