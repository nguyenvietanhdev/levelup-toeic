/**
 * `GET /api/wrong-words/review` — lấy từ ĐẾN HẠN theo lịch SM-2.
 *
 * Route này trước đây lấy MỌI từ active và bỏ qua `nextReviewDate`, khiến bốn
 * trường SM-2 chỉ là số trang trí: từ vừa trả lời đúng vẫn hiện lại ngay lượt
 * sau, và giãn cách — thứ khiến lặp lại ngắt quãng có tác dụng — không bao giờ
 * xảy ra. Test khoá lại hành vi ĐÚNG để không ai vô tình quay về như cũ.
 *
 * Không cần DB: `WrongWord.find`/`countDocuments` được thay bằng hàm giả ghi
 * lại filter, nên kiểm được chính xác truy vấn mà controller dựng.
 */
const WrongWord = require('../models/WrongWord');
const UserProfile = require('../models/UserProfile');
const ctrl = require('../controllers/wrongWordsController');

/** Bắt chước chuỗi `.sort().limit()` của Mongoose, ghi lại từng bước. */
function fakeQuery(result, spy) {
    return {
        sort(s) { spy.sort = s; return this; },
        limit(n) { spy.limit = n; return Promise.resolve(result); },
    };
}

function mockRes() {
    return {
        statusCode: 0, body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}

const USER = '507f1f77bcf86cd799439011';

let spy, findSpy, countSpy;
beforeEach(() => {
    spy = {};
    findSpy = jest.spyOn(WrongWord, 'find');
    countSpy = jest.spyOn(WrongWord, 'countDocuments').mockResolvedValue(7);
    // Controller đọc hồ sơ để biết ngôn ngữ đang học (xem
    // `wrongWordsLangFilter.test.js`). Không giả thì nó gọi DB thật và test treo.
    jest.spyOn(UserProfile, 'findOne').mockReturnValue({
        select: () => ({ lean: () => Promise.resolve({ settings: { vocabLang: 'en' } }) }),
    });
});
afterEach(() => jest.restoreAllMocks());

const run = async (query = {}) => {
    const res = mockRes();
    await ctrl.getWordsToReview({ user: { id: USER }, query }, res);
    return res;
};

describe('lọc theo HẠN ôn', () => {
    test('mặc định CHỈ lấy từ đã đến hạn', async () => {
        findSpy.mockImplementation(f => { spy.filter = f; return fakeQuery([], spy); });
        await run();

        // Thiếu điều kiện này là lịch giãn cách vô nghĩa.
        expect(spy.filter.nextReviewDate).toBeDefined();
        expect(spy.filter.nextReviewDate.$lte).toBeInstanceOf(Date);
        expect(spy.filter.status).toBe('active');
        expect(spy.filter.userId).toBe(USER);
    });

    test('all=1 bỏ lọc hạn — ôn thêm khi đã hết từ đến hạn', async () => {
        findSpy.mockImplementation(f => { spy.filter = f; return fakeQuery([], spy); });
        await run({ all: '1' });
        expect(spy.filter.nextReviewDate).toBeUndefined();
        expect(spy.filter.status).toBe('active');
    });

    test('all=true cũng được chấp nhận', async () => {
        findSpy.mockImplementation(f => { spy.filter = f; return fakeQuery([], spy); });
        await run({ all: 'true' });
        expect(spy.filter.nextReviewDate).toBeUndefined();
    });

    test('all=0 KHÔNG bỏ lọc — chỉ "1"/"true" mới bật', async () => {
        findSpy.mockImplementation(f => { spy.filter = f; return fakeQuery([], spy); });
        await run({ all: '0' });
        expect(spy.filter.nextReviewDate).toBeDefined();
    });
});

describe('thứ tự: quá hạn LÂU NHẤT trước', () => {
    test('sort theo nextReviewDate tăng dần, rồi mới tới priority', async () => {
        // Một từ trễ hai tuần cần ôn gấp hơn từ vừa đến hạn sáng nay, kể cả khi
        // priority của nó thấp hơn.
        findSpy.mockImplementation(() => fakeQuery([], spy));
        await run();
        expect(Object.keys(spy.sort)[0]).toBe('nextReviewDate');
        expect(spy.sort.nextReviewDate).toBe(1);
        expect(spy.sort.priorityScore).toBe(-1);
    });
});

describe('limit — đây là một phiên ôn, không phải chỗ kéo cả kho từ', () => {
    test('mặc định 10', async () => {
        findSpy.mockImplementation(() => fakeQuery([], spy));
        await run();
        expect(spy.limit).toBe(10);
    });

    test('chặn trên ở 50', async () => {
        findSpy.mockImplementation(() => fakeQuery([], spy));
        await run({ limit: '9999' });
        expect(spy.limit).toBe(50);
    });

    test('số 0 và số âm rơi về mặc định, không phải limit(0) = lấy TẤT CẢ', async () => {
        // `.limit(0)` trong Mongoose nghĩa là KHÔNG giới hạn — đúng ngược lại ý
        // định. Đây là lý do phải kẹp cận dưới chứ không chỉ cận trên.
        findSpy.mockImplementation(() => fakeQuery([], spy));
        await run({ limit: '0' });
        expect(spy.limit).toBe(10);

        await run({ limit: '-5' });
        expect(spy.limit).toBe(1);
    });

    test('chữ vô nghĩa rơi về mặc định', async () => {
        findSpy.mockImplementation(() => fakeQuery([], spy));
        await run({ limit: 'abc' });
        expect(spy.limit).toBe(10);
    });
});

describe('dueTotal — số cho badge ở menu', () => {
    test('đếm ĐỘC LẬP với limit, và luôn lọc theo hạn', async () => {
        // Badge phải hiện tổng số đến hạn, không phải số từ lấy về phiên này.
        findSpy.mockImplementation(() => fakeQuery([{ en: 'a' }], spy));
        const res = await run({ limit: '1' });

        expect(res.body.dueTotal).toBe(7);
        expect(res.body.count).toBe(1);

        const f = countSpy.mock.calls[0][0];
        expect(f.nextReviewDate.$lte).toBeInstanceOf(Date);
        expect(f.status).toBe('active');
    });

    test('all=1 vẫn đếm theo HẠN — badge không được nhảy lên tổng số từ', async () => {
        findSpy.mockImplementation(() => fakeQuery([], spy));
        await run({ all: '1' });
        expect(countSpy.mock.calls[0][0].nextReviewDate).toBeDefined();
    });
});

describe('phản hồi', () => {
    test('trả 200 kèm data', async () => {
        const words = [{ en: 'arrange' }, { en: 'submit' }];
        findSpy.mockImplementation(() => fakeQuery(words, spy));
        const res = await run();
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBe(words);
    });

    test('lỗi DB → 500 chứ không ném ra ngoài', async () => {
        findSpy.mockImplementation(() => { throw new Error('mất kết nối'); });
        const res = await run();
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
    });
});
