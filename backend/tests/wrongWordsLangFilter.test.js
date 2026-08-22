/**
 * Ôn từ đã sai — LỌC THEO NGÔN NGỮ đang học.
 *
 * Không lọc thì người học tiếng Trung mở phần ôn ra gặp `due`, `fiscal`,
 * `meticulously` xen giữa 你好 và 别的. Trong DB thật: 136 từ đến hạn = 98 tiếng
 * Trung trộn 38 tiếng Anh, và bảng `user_wrongwords` KHÔNG có trường `lang`.
 *
 * Hai chỗ dễ hỏng:
 *   1. 139 bản ghi CŨ không mang `lang`. Lọc thẳng `lang: 'zh'` là chúng biến
 *      mất hết — tính năng rỗng cho tới khi người dùng gặp lại từng từ.
 *   2. `dueTotal` phải lọc THEO CÙNG điều kiện. Badge báo 136 mà mở ra thấy 99
 *      là con số nói dối.
 */
const WrongWord = require('../models/WrongWord');
const UserProfile = require('../models/UserProfile');
const ctrl = require('../controllers/wrongWordsController');

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
let spy, findSpy, countSpy, profSpy;

beforeEach(() => {
    spy = {};
    findSpy = jest.spyOn(WrongWord, 'find')
        .mockImplementation(f => { spy.filter = f; return fakeQuery([], spy); });
    countSpy = jest.spyOn(WrongWord, 'countDocuments').mockResolvedValue(0);
});
afterEach(() => jest.restoreAllMocks());

/** Giả hồ sơ với ngôn ngữ chỉ định. */
function withLang(vocabLang) {
    profSpy = jest.spyOn(UserProfile, 'findOne').mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(vocabLang ? { settings: { vocabLang } } : null) }),
    });
}

const run = async (query = {}) => {
    const res = mockRes();
    await ctrl.getWordsToReview({ user: { id: USER }, query }, res);
    return res;
};

/** Gom mọi nhánh `$or` của bộ lọc thành chuỗi để soi. */
const orText = () => JSON.stringify(spy.filter.$or || []);

describe('lọc theo ngôn ngữ của HỒ SƠ', () => {
    test('vocabLang = zh → chỉ lấy từ tiếng Trung', async () => {
        withLang('zh');
        await run();
        expect(orText()).toContain('"lang":"zh"');
        expect(orText()).not.toContain('"lang":"en"');
    });

    test('vocabLang = en → chỉ lấy từ tiếng Anh', async () => {
        withLang('en');
        await run();
        expect(orText()).toContain('"lang":"en"');
        expect(orText()).not.toContain('"lang":"zh"');
    });

    test('không có hồ sơ → mặc định tiếng Anh, không phải bỏ lọc', async () => {
        // Bỏ lọc là quay lại đúng lỗi đang sửa.
        withLang(null);
        await run();
        expect(spy.filter.$or).toBeDefined();
        expect(orText()).toContain('"lang":"en"');
    });

    test('giá trị lạ trong hồ sơ → rơi về tiếng Anh', async () => {
        withLang('fr');
        await run();
        expect(orText()).toContain('"lang":"en"');
    });

    test('KHÔNG nhận lang từ client — chỉ đọc hồ sơ', async () => {
        // Client khai lang là một chỗ đoán sai dữ liệu ở ranh giới; đây là bài
        // học từ Hội thoại và Viết luận.
        withLang('zh');
        await run({ lang: 'en' });
        expect(orText()).toContain('"lang":"zh"');
        expect(profSpy).toHaveBeenCalled();
    });
});

describe('bản ghi CŨ chưa có trường lang', () => {
    test('zh: vẫn lấy được doc thiếu lang nếu mặt từ có chữ Hán', async () => {
        // 139 doc có sẵn không mang `lang`. Thiếu nhánh này là màn ôn rỗng trơn.
        withLang('zh');
        await run();
        const t = orText();
        expect(t).toContain('$exists');
        expect(t).toContain('$regex');
    });

    test('en: doc thiếu lang phải KHÔNG có chữ Hán mới được lấy', async () => {
        withLang('en');
        await run();
        const t = orText();
        expect(t).toContain('$exists');
        expect(t).toContain('$not');
    });

    test('mẫu chữ Hán phủ cả khối mở rộng A', async () => {
        // Một số chữ HSK cao nằm ngoài khối cơ bản.
        withLang('zh');
        await run();
        expect(orText()).toMatch(/u4e00|一/);
    });
});

describe('dueTotal lọc CÙNG điều kiện', () => {
    test('đếm cũng lọc theo ngôn ngữ', async () => {
        // Badge báo 136 mà mở ra chỉ có 99 là con số nói dối.
        withLang('zh');
        await run();
        const f = countSpy.mock.calls[0][0];
        expect(JSON.stringify(f.$or)).toContain('"lang":"zh"');
        expect(f.nextReviewDate.$lte).toBeInstanceOf(Date);
    });

    test('all=1 vẫn lọc ngôn ngữ ở CẢ hai truy vấn', async () => {
        withLang('zh');
        await run({ all: '1' });
        expect(orText()).toContain('"lang":"zh"');
        expect(JSON.stringify(countSpy.mock.calls[0][0].$or)).toContain('"lang":"zh"');
        // all=1 bỏ lọc HẠN nhưng không được bỏ lọc NGÔN NGỮ.
        expect(spy.filter.nextReviewDate).toBeUndefined();
    });
});

describe('phản hồi trả về lang', () => {
    test('client biết đang ôn ngôn ngữ nào', async () => {
        withLang('zh');
        const res = await run();
        expect(res.body.lang).toBe('zh');
    });
});

describe('model — trường lang', () => {
    test('có trong schema, enum en/zh, mặc định en', () => {
        // Mongoose `strict` xoá âm thầm trường không khai.
        const path = WrongWord.schema.path('lang');
        expect(path).toBeDefined();
        expect(path.options.enum).toEqual(['en', 'zh']);
        expect(path.defaultValue).toBe('en');
    });
});

describe('danh sách từ sai ở popup chọn nhóm cũng lọc theo ngôn ngữ', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const ctrl = readFileSync(
        join(__dirname, '..', 'controllers', 'wrongWordsController.js'), 'utf8');
    const model = readFileSync(
        join(__dirname, '..', 'models', 'WrongWord.js'), 'utf8');

    /** Thân `getAllWrongWords` — nơi popup chọn nhóm lấy dữ liệu. */
    function than() {
        const i = ctrl.indexOf('exports.getAllWrongWords');
        return ctrl.slice(i, ctrl.indexOf('\nexports.', i + 10));
    }

    test('đọc ngôn ngữ từ HỒ SƠ, không nhận từ client', () => {
        // Client khai `lang` là client tự chọn xem mình thấy nhóm nào — mà nó
        // không biết người dùng đang học gì.
        const t = than();
        expect(t).toMatch(/settings\?\.vocabLang === 'zh'/);
        expect(t).not.toMatch(/req\.query\.lang|req\.body\.lang/);
    });

    test('truyền `lang` xuống truy vấn', () => {
        // Thiếu tham số này thì popup hiện lẫn nhóm tiếng Trung với tiếng Anh,
        // và chọn nhóm nào cũng ra một lượt ôn lẫn lộn — đúng lỗi người dùng báo.
        expect(than()).toMatch(/getActiveWords\(userId, limit, lang\)/);
    });

    test('bộ lọc dùng CHUNG một nguồn, không chép đôi', () => {
        // Hai bản sao của cùng một regex thì sửa một bên là hai endpoint lọc
        // khác nhau, mà không lỗi nào báo.
        expect(model).toMatch(/statics\.langFilter/);
        expect(ctrl).toMatch(/WrongWord\.langFilter\(lang\)/);
        // Regex chữ Hán chỉ được khai ở MỘT chỗ.
        expect(ctrl).not.toMatch(/u4e00/);
    });

    test('bản ghi cũ chưa có `lang` vẫn lọc đúng bằng chữ Hán', () => {
        // 139 bản ghi trong DB không có trường `lang`. Bỏ qua chúng thì tính
        // năng vô dụng cho tới khi người dùng gặp lại từng từ.
        const i = model.indexOf('statics.langFilter');
        const t = model.slice(i, model.indexOf('\n};', i));
        expect(t).toMatch(/\$exists: false/);
        expect(t).toMatch(/\$not: \{ \$regex: HAN \}/);
    });
});
