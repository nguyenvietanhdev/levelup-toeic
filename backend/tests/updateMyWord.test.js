/**
 * PUT /api/upload/my-vocabulary/:wordId — sửa một từ trong bộ từ vựng riêng.
 *
 * Hai thứ phải chốt, vì sai là hỏng lặng lẽ chứ không báo lỗi:
 *
 * 1. LỌC THEO CHỦ SỞ HỮU. Tìm bản ghi chỉ bằng `_id` thì ai biết id cũng sửa
 *    được từ của người khác — không có dấu hiệu gì, chủ sở hữu chỉ thấy từ của
 *    mình tự nhiên đổi nội dung.
 *
 * 2. KHÔNG cho đổi `source`/`part` qua route này. `source` quyết định từ nằm ở
 *    kho nào, `part` quyết định nó xuất hiện trong bài luyện nào. Cho đổi nghĩa
 *    là một request "sửa từ" có thể ném từ sang kho khác. Muốn chuyển kho thì
 *    xoá rồi thêm lại.
 */
const fs = require('fs');
const path = require('path');

const controller = fs
    .readFileSync(path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const routes = fs
    .readFileSync(path.join(__dirname, '..', 'routes', 'uploadRoutes.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

/** Thân hàm updateMyWord, cắt tới hàm kế tiếp. */
function updateMyWordBody() {
    const start = controller.indexOf('exports.updateMyWord');
    expect(start).toBeGreaterThan(-1);
    const next = controller.indexOf('exports.', start + 10);
    return controller.slice(start, next === -1 ? undefined : next);
}

describe('updateMyWord — quyền và phạm vi sửa', () => {

    test('route PUT đã đăng ký và có middleware protect', () => {
        expect(routes).toMatch(/router\.put\(\s*['"]\/my-vocabulary\/:wordId['"]\s*,\s*protect\s*,\s*updateMyWord/);
    });

    test('tìm bản ghi kèm ownerEmail — KHÔNG chỉ bằng _id', () => {
        const body = updateMyWordBody();
        // Đây là ranh giới giữa "sửa từ của mình" và "sửa từ của bất kỳ ai".
        expect(body).toMatch(/findOne\(\{[^}]*_id:\s*wordId[^}]*ownerEmail/s);
    });

    test('không tìm thấy thì trả 404, không tạo mới', () => {
        const body = updateMyWordBody();
        expect(body).toMatch(/status\(404\)/);
        // Tuyệt đối không upsert: sửa nhầm id mà tạo bản ghi mới là rác dữ liệu.
        expect(body).not.toMatch(/upsert/);
    });

    test('KHÔNG gán source/part/ownerEmail từ req.body', () => {
        const body = updateMyWordBody();
        expect(body).not.toMatch(/word\.source\s*=/);
        expect(body).not.toMatch(/word\.part\s*=/);
        expect(body).not.toMatch(/word\.ownerEmail\s*=/);
    });

    test('source/part không nằm trong danh sách trường destructure', () => {
        const body = updateMyWordBody();
        const destructure = body.match(/const \{([^}]*)\} = req\.body/)?.[1] || '';
        expect(destructure).not.toMatch(/\bsource\b/);
        expect(destructure).not.toMatch(/\bpart\b/);
    });

    test('chặn trùng tên trong cùng kho khi đổi `en`', () => {
        const body = updateMyWordBody();
        // Khoá upsert lúc thêm là (ownerEmail, source, en); đổi `en` thành tên đã
        // có là hai bản ghi trùng nhau trong một kho.
        expect(body).toMatch(/status\(409\)/);
        expect(body).toMatch(/\$ne:\s*word\._id/);
    });

    test('en rỗng bị từ chối', () => {
        expect(updateMyWordBody()).toMatch(/status\(400\)/);
    });

    test('tự kiểm: bộ dò thật sự đọc được thân hàm', () => {
        // Không có ca này thì mọi expect ở trên xanh kể cả khi cắt nhầm đoạn rỗng.
        const body = updateMyWordBody();
        expect(body.length).toBeGreaterThan(300);
        expect(body).toMatch(/UserUpload/);
    });
});
