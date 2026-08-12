/**
 * `req.user.email` phải do `protect` cấp, và không handler nào được tự truy vấn lại.
 *
 * Vì sao đáng chốt bằng máy chứ không chỉ là dọn dẹp:
 *
 * Quyền sở hữu của từ vựng riêng biểu diễn bằng CHUỖI `ownerEmail`
 * (models/UserUpload.js:40), nên 9 handler trong uploadController đều mở đầu bằng
 *
 *     const userDoc = await User.findById(req.user.id).select('email').lean();
 *     const email = userDoc?.email;
 *
 * Ngoài việc thừa một lượt đi về DB mỗi request, `?.` ở đó là một cái bẫy: doc
 * null thì `email` là `undefined`, mà Mongoose BỎ HẲN key có giá trị undefined
 * khỏi filter. `{ ownerEmail: undefined, source }` co lại thành `{ source }` —
 * `getMyTopics` gom dữ liệu của MỌI người dùng, `deleteMySource` xoá xuyên chủ
 * sở hữu. Không có lỗi nào cả; truy vấn chạy thành công, chỉ là trên sai phạm vi.
 *
 * Hôm nay `protect` đã 401 khi không có user nên chưa với tới được. Nhưng đây là
 * loại bất biến "đúng nhờ một chỗ khác vẫn đúng" — thêm tầng phân quyền chia sẻ
 * vào là nó mỏng đi. Đóng hẳn bằng cách bỏ nhánh `?.` đi.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const controller = fs
    .readFileSync(path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const authSrc = fs
    .readFileSync(path.join(__dirname, '..', 'middleware', 'auth.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

describe('req.user.email — nguồn duy nhất của email người gọi', () => {

    test('protect gán email vào req.user', () => {
        expect(authSrc).toMatch(/req\.user\s*=\s*\{[^}]*email:\s*user\.email/s);
    });

    test('uploadController KHÔNG còn tự truy vấn email', () => {
        // Mỗi chỗ còn lại là một lượt đi về DB thừa, và một nhánh `?.` có thể
        // sinh ra filter thiếu phạm vi.
        expect(controller).not.toMatch(/select\(\s*['"]email['"]\s*\)/);
        expect(controller).not.toMatch(/userDoc\?\.email/);
    });

    test('mọi handler đọc thẳng req.user.email', () => {
        const uses = controller.match(/req\.user\.email/g) || [];
        // 8 handler dùng email; con số thấp bất thường nghĩa là có chỗ vẫn lấy
        // email theo đường khác.
        expect(uses.length).toBeGreaterThanOrEqual(8);
    });

    test('tự kiểm: bộ dò thật sự đọc được nội dung file', () => {
        // Thiếu ca này thì mọi expect ở trên xanh kể cả khi đọc phải chuỗi rỗng.
        expect(controller.length).toBeGreaterThan(2000);
        expect(controller).toMatch(/UserUpload/);
        expect(authSrc).toMatch(/exports\.protect|const protect/);
    });
});

/**
 * Ca giải thích VÌ SAO nguy hiểm, không chỉ "có/không có".
 *
 * Chứng minh trên chính Mongoose rằng `undefined` làm rơi key khỏi filter — đó
 * là cơ chế biến một truy vấn "của tôi" thành "của tất cả mọi người".
 */
describe('undefined trong filter làm rơi phạm vi truy vấn', () => {
    const UserUpload = require('../models/UserUpload');

    test('{ownerEmail: undefined} không tới được MongoDB — mất ràng buộc chủ sở hữu', () => {
        const filter = UserUpload
            .find({ ownerEmail: undefined, source: 'verb_pattern' })
            .getFilter();

        // Phải kiểm ở đúng tầng. Key VẪN nằm trên object JS (`'ownerEmail' in
        // filter` là true) — bản đầu của test này khẳng định ngược lại và đỏ.
        // Thứ đi xuống driver là bản đã tuần tự hoá, mà `undefined` không tồn
        // tại trong BSON/JSON: nó biến mất ở đó.
        expect('ownerEmail' in filter).toBe(true);          // còn trên JS
        expect(JSON.parse(JSON.stringify(filter)))          // nhưng không xuống DB
            .toEqual({ source: 'verb_pattern' });
    });

    test('email hợp lệ thì phạm vi được giữ nguyên tới DB', () => {
        const filter = UserUpload
            .find({ ownerEmail: 'a@b.com', source: 'verb_pattern' })
            .getFilter();
        expect(JSON.parse(JSON.stringify(filter)))
            .toEqual({ ownerEmail: 'a@b.com', source: 'verb_pattern' });
    });

    afterAll(async () => {
        // find() không kết nối DB, nhưng model có đăng ký connection — đóng cho sạch.
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
});
