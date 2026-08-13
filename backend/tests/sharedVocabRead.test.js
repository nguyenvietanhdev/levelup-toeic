/**
 * Đường đọc của NGƯỜI ĐƯỢC chia sẻ bộ từ vựng riêng.
 *
 * Hai chế độ hỏng phải chốt bằng máy — cả hai đều im lặng:
 *
 * 1. BIA MỘ. Từ vựng tự xoá theo TTL (mọi bộ hết hạn trong 2-4 tuần). Nếu
 *    getSharedTopics ghép từ phía SỐ LIỆU (inner join, hoặc thêm
 *    `$match: {wordCount: {$gt: 0}}`), bộ đã bị xoá sạch sẽ biến mất khỏi danh
 *    sách: người nhận từng thấy nó, giờ không thấy nữa, không có gì giải thích.
 *    Phải ghép từ phía GRANT — grant mồ côi ở lại chính là để hiện "đã hết hạn".
 *
 * 2. IDOR. getSharedVocabulary nhận `ownerEmail` TỪ URL. Đọc từ theo giá trị đó
 *    rồi mới kiểm quyền (hoặc kiểm hời hợt) là ai cũng đọc được kho của người
 *    khác chỉ bằng cách đoán email + tên bộ. Phải tra grant TRƯỚC, và truy vấn
 *    từ phải dùng giá trị đã qua grant.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const controller = fs
    .readFileSync(path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const routes = fs
    .readFileSync(path.join(__dirname, '..', 'routes', 'uploadRoutes.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

function bodyOf(name) {
    const start = controller.indexOf(`exports.${name}`);
    expect(start).toBeGreaterThan(-1);
    const next = controller.indexOf('exports.', start + 10);
    return controller.slice(start, next === -1 ? undefined : next);
}

describe('getSharedTopics — bộ hết hạn vẫn phải hiện làm bia mộ', () => {
    const body = () => bodyOf('getSharedTopics');

    test('ghép từ phía GRANT, KHÔNG lọc bớt trên đường đi', () => {
        // Mọi grant phải có mặt trong kết quả, kể cả cái không còn từ nào.
        //
        // Bản đầu của test này chỉ kiểm có chuỗi `grants.map(` — quá lỏng:
        // `grants.filter(...).map(` vẫn khớp, nên đảo chiều KHÔNG bắt được lỗi
        // bỏ bia mộ. Phải chốt là `map` gắn TRỰC TIẾP vào `grants`.
        expect(body()).toMatch(/const data = grants\.map\(/);
        expect(body()).not.toMatch(/grants\s*\.?\s*\n?\s*\.filter\(/);
    });

    test('KHÔNG lọc bỏ bộ có 0 từ ở bất kỳ tầng nào', () => {
        const b = body();
        // Lọc ở tầng aggregate…
        expect(b).not.toMatch(/wordCount:\s*\{\s*\$gt/);
        // …hay ở tầng JS, đều làm bia mộ biến mất.
        expect(b).not.toMatch(/wordCount\s*>\s*0/);
        expect(b).not.toMatch(/byKey\.has\(/);
    });

    test('đánh dấu `expired` để giao diện phân biệt được', () => {
        expect(body()).toMatch(/expired:\s*wordCount === 0/);
    });

    test('trả nearestExpiry + expiringSoon — người nhận phải THẤY ngày chết', () => {
        // Họ không gia hạn được (không phải dữ liệu của họ) nhưng phải biết trước.
        const b = body();
        expect(b).toMatch(/nearestExpiry/);
        expect(b).toMatch(/expiringSoon/);
    });

    test('chỉ lấy grant của CHÍNH người gọi, và ĐÃ DUYỆT', () => {
        // Thêm `status: 'accepted'`: chia sẻ không còn tự đẩy bộ từ vào danh sách
        // chọn đề của người nhận — ai biết ID cũng làm được thì đó là đường spam.
        // Bộ chờ duyệt nằm ở getPendingShares.
        expect(body()).toMatch(/VocabShare\.find\(\{\s*granteeEmail:\s*me,\s*status:\s*'accepted'\s*\}\)/);
    });

    test('không có grant nào thì trả sớm, không chạy aggregate rỗng', () => {
        expect(body()).toMatch(/grants\.length === 0/);
    });
});

describe('getSharedVocabulary — tra quyền trước, đọc sau', () => {
    const body = () => bodyOf('getSharedVocabulary');

    test('tra grant TRƯỚC khi truy vấn từ', () => {
        const b = body();
        const grantAt = b.indexOf('VocabShare.findOne');
        const wordsAt = b.indexOf('UserUpload.find');
        expect(grantAt).toBeGreaterThan(-1);
        expect(wordsAt).toBeGreaterThan(grantAt);   // đảo thứ tự = lỗ IDOR
    });

    test('không có grant thì 403, không trả dữ liệu', () => {
        expect(body()).toMatch(/status\(403\)/);
    });

    test('truy vấn từ dùng giá trị ĐÃ QUA grant, không dùng thẳng param', () => {
        // Dùng thẳng `ownerEmail` từ URL thì kiểm quyền chỉ là trang trí.
        expect(body()).toMatch(/UserUpload\.find\(\{\s*ownerEmail:\s*grant\.ownerEmail/);
    });

    test('grant lookup gắn granteeEmail = người gọi', () => {
        expect(body()).toMatch(/granteeEmail:\s*me/);
    });

    test('validate email trên URL trước khi chạm DB', () => {
        const b = body();
        expect(b).toMatch(/EMAIL_RE\.test\(ownerEmail\)/);
        expect(b.indexOf('EMAIL_RE.test')).toBeLessThan(b.indexOf('VocabShare.findOne'));
    });
});

describe('route', () => {
    test('cả hai route đều có protect', () => {
        expect(routes).toMatch(/router\.get\(\s*['"]\/shared-topics['"]\s*,\s*protect\s*,\s*getSharedTopics/);
        expect(routes).toMatch(/router\.get\(\s*['"]\/shared-vocabulary\/:ownerEmail\/:source['"]\s*,\s*protect\s*,\s*getSharedVocabulary/);
    });

    test('tự kiểm: bộ dò đọc được thân hàm thật', () => {
        expect(bodyOf('getSharedTopics').length).toBeGreaterThan(500);
        expect(bodyOf('getSharedVocabulary').length).toBeGreaterThan(300);
    });
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
