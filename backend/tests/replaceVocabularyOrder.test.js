/**
 * Test thứ tự thao tác của `POST /api/vocabulary/replace`.
 *
 * Vì sao cần: hàm này từng gọi `deleteMany` TRƯỚC rồi mới validate từng phần tử.
 * Body rác kiểu `{ words: [{}] }` qua được chốt "mảng không rỗng", xoá sạch
 * collection, rồi mới trả 400 — người gửi thấy request hỏng còn dữ liệu thì đã
 * mất. Guard admin thêm ở `routes/vocabulary.js` chặn người lạ, nhưng KHÔNG chặn
 * chính admin import nhầm file, nên thứ tự này phải được chốt riêng.
 *
 * Đồng thời chốt luôn: lệnh xoá phải mang `PUBLIC_FILTER` để không đụng bản ghi
 * scope:'private' — mọi chỗ xoá khác trong controller đều áp, riêng chỗ này sót.
 *
 * Test thuần, không DB: mock model + logger.
 */
jest.mock('../models/Vocabulary', () => ({
    deleteMany: jest.fn(),
    insertMany: jest.fn(),
    // Cố ý có mặt và cố ý KHÔNG được gọi khi vượt trần import: nếu nó được gọi
    // nghĩa là vòng lặp 2-truy-vấn-mỗi-từ đã chạy, tức trần không chặn được gì.
    findOne: jest.fn(),
}));
jest.mock('../models/VocabularyZh', () => ({ deleteMany: jest.fn(), insertMany: jest.fn() }));
jest.mock('../utils/activityLogger', () => ({
    logActivity: jest.fn(),
    // Controller truyền actorOf(req) làm tham số thứ tư — thiếu nó ở mock là
    // handler ném TypeError rồi rơi vào next(), không phải res.json().
    actorOf: jest.fn(() => 'test-actor'),
}));
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

const Vocabulary = require('../models/Vocabulary');
const { replaceVocabulary, bulkImportVocabulary } = require('../controllers/vocabularyController');

/** req/res/next giả — res ghi lại status + body để assert. */
function mkCtx(body) {
    const res = {
        statusCode: null,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
    return { req: { body, query: {} }, res, next: jest.fn() };
}

const validWord = { en: 'delegate', vn: 'uỷ thác', part: 'V', type: 'verb' };

beforeEach(() => jest.clearAllMocks());

/**
 * Trần số từ mỗi lần import.
 *
 * Vòng lặp import tốn 2 lượt chạm DB cho MỖI phần tử (findOne + save). Không có
 * trần thì một body 2MB — khoảng 10.000 từ — là 20.000 lượt truy vấn tuần tự
 * trên một tiến trình Node đơn luồng. Vài request như vậy cùng lúc là cả web
 * đứng, và route này chỉ cần một tài khoản admin để gọi.
 */
describe('trần số từ mỗi lần import', () => {
    const tooMany = () => Array.from({ length: 2001 }, (_, i) => ({ en: `w${i}`, vn: 'x' }));

    test('/bulk vượt trần → 413, KHÔNG chạm DB', async () => {
        const { req, res, next } = mkCtx({ words: tooMany() });

        await bulkImportVocabulary(req, res, next);

        expect(res.statusCode).toBe(413);
        expect(Vocabulary.findOne).not.toHaveBeenCalled();
        expect(Vocabulary.insertMany).not.toHaveBeenCalled();
    });

    test('/replace vượt trần → 413, KHÔNG xoá gì', async () => {
        const { req, res, next } = mkCtx({ words: tooMany() });

        await replaceVocabulary(req, res, next);

        expect(res.statusCode).toBe(413);
        expect(Vocabulary.deleteMany).not.toHaveBeenCalled();
    });

    test('thông báo lỗi nói rõ trần và số đang gửi, để người dùng biết chia bao nhiêu', async () => {
        const { req, res, next } = mkCtx({ words: tooMany() });
        await replaceVocabulary(req, res, next);
        expect(res.body.message).toMatch(/2000/);
        expect(res.body.message).toMatch(/2001/);
    });

    test('đúng bằng trần thì vẫn qua — chặn ở > chứ không phải >=', async () => {
        const words = Array.from({ length: 2000 }, (_, i) => ({ en: `w${i}`, vn: 'x', part: 'N', type: 'noun' }));
        const { req, res, next } = mkCtx({ words });

        await replaceVocabulary(req, res, next);

        expect(res.statusCode).not.toBe(413);
        expect(Vocabulary.deleteMany).toHaveBeenCalled();
    });
});

describe('replaceVocabulary — validate trước, xoá sau', () => {
    test('body rác → KHÔNG xoá gì, trả 400', async () => {
        const { req, res, next } = mkCtx({ words: [{}] });

        await replaceVocabulary(req, res, next);

        // Đây là assert quan trọng nhất của cả file.
        expect(Vocabulary.deleteMany).not.toHaveBeenCalled();
        expect(Vocabulary.insertMany).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
    });

    test('một phần tử hỏng giữa danh sách hợp lệ → vẫn không xoá gì', async () => {
        const { req, res, next } = mkCtx({ words: [validWord, { vn: 'thiếu en' }, validWord] });

        await replaceVocabulary(req, res, next);

        expect(Vocabulary.deleteMany).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
    });

    test('mảng rỗng → không xoá gì', async () => {
        const { req, res, next } = mkCtx({ words: [] });

        await replaceVocabulary(req, res, next);

        expect(Vocabulary.deleteMany).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
    });

    test('payload hợp lệ → xoá rồi nạp lại, và lệnh xoá mang PUBLIC_FILTER', async () => {
        const { req, res, next } = mkCtx({ words: [validWord], source: 'ets2024' });

        await replaceVocabulary(req, res, next);

        expect(Vocabulary.deleteMany).toHaveBeenCalledTimes(1);
        expect(Vocabulary.deleteMany).toHaveBeenCalledWith({
            scope: { $ne: 'private' },
            source: 'ets2024',
        });
        expect(Vocabulary.insertMany).toHaveBeenCalledTimes(1);
        expect(res.body).toMatchObject({ success: true, count: 1 });
    });

    test('không truyền source → xoá toàn bộ bản ghi công khai, vẫn chừa scope private', async () => {
        const { req, res, next } = mkCtx({ words: [validWord] });

        await replaceVocabulary(req, res, next);

        expect(Vocabulary.deleteMany).toHaveBeenCalledWith({ scope: { $ne: 'private' } });
    });
});
