/**
 * Đếm từ sai theo NGUỒN và theo PART — cho thẻ đề / thẻ Part.
 *
 * Hai điều quan trọng ở đây:
 *
 *   · Đếm bằng AGGREGATE, không tải danh sách rồi đếm. `getAllWrongWords` có
 *     `limit`, nên đếm từ đó là con số trần ở giới hạn ấy — sai âm thầm đúng
 *     với người có nhiều từ sai, tức nhóm cần con số này nhất.
 *
 *   · Kho SONG NGỮ phải được lọc đúng. Bản cũ viết `=== 'zh' ? 'zh' : 'en'` ở
 *     cả hai chỗ đọc ngôn ngữ, nên `bi` rơi vào nhánh `en` — mà
 *     `langFilter('en')` loại hẳn `lang: 'bi'`. Người học song ngữ KHÔNG BAO
 *     GIỜ thấy từ sai của mình, dù chúng vẫn được ghi vào DB bình thường.
 */
const fs = require('fs');
const path = require('path');

const ctrl = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'wrongWordsController.js'), 'utf8');
const routes = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'wrongWords.js'), 'utf8');

/** Thân `getSummary`. */
const thanSummary = (() => {
    const i = ctrl.indexOf('exports.getSummary');
    expect(i).toBeGreaterThan(-1);
    const j = ctrl.indexOf('\nexports.', i + 10);
    return ctrl.slice(i, j > i ? j : ctrl.length);
})();

describe('kho đang học — ba giá trị, không phải hai', () => {
    /** `khoDangHoc` dựng từ chính mã nguồn rồi gọi thật. */
    const khoDangHoc = (() => {
        const i = ctrl.indexOf('function khoDangHoc');
        expect(i).toBeGreaterThan(-1);
        const than = ctrl.slice(i, ctrl.indexOf('\n}', i) + 2);
        // eslint-disable-next-line no-new-func
        return new Function(`${than}; return khoDangHoc;`)();
    })();

    test('song ngữ giữ nguyên `bi`', () => {
        // Đây là con bug: quy về `en` thì `langFilter` loại hẳn `lang: 'bi'`.
        expect(khoDangHoc({ settings: { vocabLang: 'bi' } })).toBe('bi');
    });

    test('tiếng Trung giữ `zh`', () => {
        expect(khoDangHoc({ settings: { vocabLang: 'zh' } })).toBe('zh');
    });

    test('mọi thứ khác về `en`', () => {
        expect(khoDangHoc({ settings: { vocabLang: 'en' } })).toBe('en');
        expect(khoDangHoc({ settings: {} })).toBe('en');
        expect(khoDangHoc(null)).toBe('en');
        // Giá trị lạ trong DB không được biến thành bộ lọc lạ.
        expect(khoDangHoc({ settings: { vocabLang: 'xx' } })).toBe('en');
    });

    test('CẢ HAI chỗ đọc ngôn ngữ đều dùng chung hàm này', () => {
        // Sửa một chỗ thì tab "Từ vựng sai" hiện đúng mà chế độ "Ôn lại từ sai"
        // vẫn rỗng — hoặc ngược lại.
        expect((ctrl.match(/khoDangHoc\(profile\)/g) || []).length)
            .toBeGreaterThanOrEqual(2);
    });
});

describe('`getSummary` đếm ở tầng DB', () => {
    test('dùng aggregate, không phải `find` rồi đếm', () => {
        expect(thanSummary).toMatch(/WrongWord\.aggregate\(/);
        expect(thanSummary).not.toMatch(/getActiveWords|\.find\(/);
    });

    test('KHÔNG có `limit` — đây là phép đếm, không phải trang danh sách', () => {
        expect(thanSummary).not.toMatch(/\$limit|limit:/);
    });

    test('chỉ đếm từ đang `active`', () => {
        // Từ đã thuộc hẳn không còn là việc phải làm.
        expect(thanSummary).toMatch(/status: 'active'/);
    });

    test('lọc theo ngôn ngữ đang học', () => {
        expect(thanSummary).toMatch(/WrongWord\.langFilter\(lang\)/);
        expect(thanSummary).toMatch(/khoDangHoc\(profile\)/);
    });

    test('gom theo CẢ `source` lẫn `part`', () => {
        expect(thanSummary).toMatch(/_id: \{ source: '\$source', part: '\$part' \}/);
        expect(thanSummary).toMatch(/theoNguon:/);
        expect(thanSummary).toMatch(/theoPart:/);
    });

    test('trả HAI con số: tổng sai và số tới hạn ôn', () => {
        // `sai` cho thẻ đề/Part ("đã sai bao nhiêu"), `canOn` cho tab Từ vựng
        // sai ("còn bao nhiêu phải ôn"). Trả một con số là chỗ gọi phải đoán.
        expect(thanSummary).toMatch(/sai: \{ \$sum: 1 \}/);
        // Đếm có điều kiện: 1 nếu đã tới hạn, 0 nếu chưa.
        expect(thanSummary).toMatch(/\$cond: \[.*, 1, 0\]/);
        expect(thanSummary).toMatch(/canOn:/);
    });

    test('`nextReviewDate` so với giờ SERVER', () => {
        // So bằng giờ máy người dùng thì máy lệch giờ là con số lệch theo.
        expect(thanSummary).toMatch(/const now = new Date\(\)/);
        expect(thanSummary).toMatch(/\$lte: \['\$nextReviewDate', now\]/);
    });

    test('bỏ qua nhóm có khoá RỖNG', () => {
        // Bản ghi thiếu `part` hoặc `source` gom hết vào khoá '' — một thẻ ma
        // không tương ứng đề nào.
        expect(thanSummary).toMatch(/if \(!k\) continue;/);
    });

    test('lỗi thì trả 500 gọn, không ném ra ngoài', () => {
        expect(thanSummary).toMatch(/catch \(error\)/);
        expect(thanSummary).toMatch(/status\(500\)/);
    });
});

describe('route', () => {
    test('có `GET /summary`', () => {
        expect(routes).toMatch(/router\.get\('\/summary', getSummary\)/);
    });

    test('nằm sau `protect` như các route khác', () => {
        // File này `router.use(gate)`/`protect` ở đầu; đặt route trước đó là
        // ai cũng đọc được số từ sai của người khác.
        const iProtect = routes.search(/router\.use\(/);
        expect(iProtect).toBeGreaterThan(-1);
        expect(routes.indexOf("router.get('/summary'")).toBeGreaterThan(iProtect);
    });
});
