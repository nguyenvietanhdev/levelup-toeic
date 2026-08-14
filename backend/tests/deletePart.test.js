/**
 * Xóa TRỌN một Part trong một nguồn từ vựng.
 *
 * Trước đây chỉ có hai mức: xoá từng từ (nút ×), hoặc xoá sạch cả nguồn. Muốn bỏ
 * một buổi nhập nhầm thì phải bấm × mấy chục lần, hoặc xoá cả nguồn rồi nhập
 * lại từ đầu — "công cốc".
 *
 * Ba chỗ hỏng IM LẶNG mà test này giữ:
 *
 *   1. `part` được chuẩn hoá thành CHỮ HOA lúc nhập (`upper()` trong
 *      uploadVocabulary). Không chuẩn hoá lại ở endpoint xoá thì "buoi 3" gửi
 *      lên không khớp "BUOI 3" trong DB → xoá 0 từ nhưng vẫn báo thành công.
 *   2. Xoá Part CUỐI CÙNG nghĩa là nguồn cũng biến mất (nguồn chỉ tồn tại chừng
 *      nào còn từ). Không báo ra thì client vẫn dựng lại bảng cho một nguồn đã
 *      chết.
 *   3. Route `/my-source/:source/part/:part` phải tồn tại và có `protect` —
 *      thiếu guard là ai cũng xoá được dữ liệu người khác.
 */
const fs = require('fs');
const path = require('path');

const controller = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8');
const routes = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'uploadRoutes.js'), 'utf8');

/** Thân hàm deleteMySourcePart. */
function handlerBody() {
    const i = controller.indexOf('exports.deleteMySourcePart');
    expect(i).toBeGreaterThan(-1);
    const j = controller.indexOf('exports.', i + 10);
    return controller.slice(i, j > -1 ? j : controller.length);
}

describe('route', () => {
    test('có endpoint xoá theo Part', () => {
        expect(routes).toMatch(/router\.delete\(\s*'\/my-source\/:source\/part\/:part'/);
    });

    test('bắt buộc đăng nhập', () => {
        // Thiếu `protect` là ai cũng xoá được dữ liệu của người khác.
        expect(routes).toMatch(/'\/my-source\/:source\/part\/:part',\s*protect,\s*deleteMySourcePart/);
    });

    test('khai báo TRƯỚC route xoá cả nguồn', () => {
        // Không bắt buộc về kỹ thuật (số đoạn URL khác nhau), nhưng đọc từ hẹp
        // tới rộng — và nếu sau này `:source` đổi thành dạng khớp nhiều đoạn thì
        // nó sẽ nuốt mất route này.
        const partIdx = routes.indexOf("'/my-source/:source/part/:part'");
        const srcIdx = routes.indexOf("'/my-source/:source'");
        expect(partIdx).toBeLessThan(srcIdx);
    });

    test('được export từ controller', () => {
        expect(routes).toMatch(/deleteMySourcePart,/);
        expect(controller).toMatch(/exports\.deleteMySourcePart/);
    });
});

describe('chuẩn hoá tên Part', () => {
    const body = handlerBody();

    test('đưa về CHỮ HOA trước khi so khớp', () => {
        // Đây là bẫy chính: DB lưu "BUOI 3", URL gửi "buoi 3" → không khớp,
        // xoá 0 từ, báo thành công.
        expect(body).toMatch(/upper\(part\)/);
    });

    test('lọc theo đúng bộ ba chủ sở hữu + nguồn + part', () => {
        // Thiếu `ownerEmail` là xoá nhầm dữ liệu người khác cùng tên nguồn.
        expect(body).toMatch(/ownerEmail:\s*email/);
        expect(body).toMatch(/source,/);
        expect(body).toMatch(/part:\s*normalizedPart/);
    });

    test('Part rỗng thì từ chối, không xoá bừa', () => {
        // `{ part: '' }` mà lọt xuống deleteMany là xoá nhầm các từ chưa gắn Part.
        expect(body).toMatch(/if \(!normalizedPart\)/);
        expect(body).toMatch(/status\(400\)/);
    });
});

describe('phản hồi cho client', () => {
    const body = handlerBody();

    test('không tìm thấy Part → 404, không im lặng báo thành công', () => {
        expect(body).toMatch(/if \(!inPart\)/);
        expect(body).toMatch(/status\(404\)/);
    });

    test('đếm TRƯỚC khi xoá để biết có phải Part cuối không', () => {
        // Đếm sau khi xoá thì `inSource` đã trừ mất phần vừa xoá → luôn tưởng là
        // Part cuối cùng.
        const delIdx = body.indexOf('deleteMany');
        const countIdx = body.indexOf('countDocuments');
        expect(countIdx).toBeLessThan(delIdx);
    });

    test('báo `sourceGone` khi đó là Part cuối cùng', () => {
        expect(body).toMatch(/sourceGone/);
        expect(body).toMatch(/inPart >= inSource/);
    });

    test('trả về số từ đã xoá', () => {
        expect(body).toMatch(/deletedCount/);
    });
});
