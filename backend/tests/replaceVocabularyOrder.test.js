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
jest.mock('../models/Vocabulary', () => ({ deleteMany: jest.fn(), insertMany: jest.fn() }));
jest.mock('../models/VocabularyZh', () => ({ deleteMany: jest.fn(), insertMany: jest.fn() }));
jest.mock('../utils/activityLogger', () => ({ logActivity: jest.fn() }));
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

const Vocabulary = require('../models/Vocabulary');
const { replaceVocabulary } = require('../controllers/vocabularyController');

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
