/**
 * Chia sẻ bộ "Từ vựng riêng": model + API cấp/thu hồi quyền.
 *
 * Ba thứ phải chốt, vì sai là hỏng lặng lẽ chứ không báo lỗi:
 *
 * 1. CẤP QUYỀN PHẢI KIỂM SỞ HỮU. "Bộ từ" không phải một document — nó chỉ là
 *    chuỗi `source` chung của N từ trong `user_upload`, nên không có chỗ nào
 *    khác để kiểm quyền. Thiếu bước này thì ai cũng cấp được quyền trên bộ của
 *    người khác chỉ bằng cách đoán đúng tên `source`.
 *
 * 2. THU HỒI PHẢI LỌC KÈM `ownerEmail`. Thiếu nó thì bất kỳ ai cũng huỷ được
 *    chia sẻ của bất kỳ ai, chỉ cần biết tên bộ và email người nhận.
 *
 * 3. GRANT KHÔNG ĐƯỢC CÓ TTL. Từ vựng tự xoá khi `expiresAt` qua hạn (mọi bộ
 *    hiện có hết hạn trong 2-4 tuần). Nếu grant chết cùng thì người nhận thấy bộ
 *    từ biến mất không dấu vết. Grant mồ côi ở lại chính là thứ cho phép hiện
 *    "bộ này đã hết hạn" — xem giai đoạn sau.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const VocabShare = require('../models/VocabShare');
const { EMAIL_RE } = require('../models/VocabShare');

const controller = fs
    .readFileSync(path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const routes = fs
    .readFileSync(path.join(__dirname, '..', 'routes', 'uploadRoutes.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

/** Thân một handler, cắt tới `exports.` kế tiếp. */
function bodyOf(name) {
    const start = controller.indexOf(`exports.${name}`);
    expect(start).toBeGreaterThan(-1);
    const next = controller.indexOf('exports.', start + 10);
    return controller.slice(start, next === -1 ? undefined : next);
}

describe('model VocabShare', () => {
    const idx = VocabShare.schema.indexes();

    test('khoá duy nhất trên (ownerEmail, source, granteeEmail)', () => {
        // Chia sẻ lại cho cùng người phải là không-thao-tác, không tạo bản ghi thứ hai.
        const unique = idx.find(([, opt]) => opt?.unique);
        expect(unique).toBeDefined();
        expect(Object.keys(unique[0]).sort()).toEqual(['granteeEmail', 'ownerEmail', 'source']);
    });

    test('có index theo granteeEmail — đường "chia sẻ với tôi" chạy mỗi lần mở modal', () => {
        expect(idx.some(([k]) => Object.keys(k).length === 1 && k.granteeEmail === 1)).toBe(true);
    });

    test('KHÔNG có TTL — grant phải sống lâu hơn từ vựng', () => {
        // Đây là điều kiện để người nhận thấy "bộ đã hết hạn" thay vì thấy bộ từ
        // biến mất không dấu vết.
        expect(idx.some(([, opt]) => opt && 'expireAfterSeconds' in opt)).toBe(false);
    });

    test('granteeEmail là CHUỖI, không ref sang User', () => {
        // Cố ý: phải mời được cả người chưa đăng ký. Bắt phải tồn tại thì lời mời
        // hụt ngay lúc chủ cần nó nhất, mà chủ không hiểu vì sao.
        const p = VocabShare.schema.path('granteeEmail');
        expect(p.instance).toBe('String');
        expect(p.options.ref).toBeUndefined();
    });

    test('email chuẩn hoá lowercase — khớp được với UserUpload.ownerEmail', () => {
        const doc = new VocabShare({ ownerEmail: 'A@B.COM', source: 'x', granteeEmail: 'C@D.COM' });
        expect(doc.ownerEmail).toBe('a@b.com');
        expect(doc.granteeEmail).toBe('c@d.com');
    });

    test('email rác bị từ chối ngay ở tầng model', () => {
        const doc = new VocabShare({ ownerEmail: 'a@b.com', source: 'x', granteeEmail: 'khong-phai-email' });
        expect(doc.validateSync()?.errors?.granteeEmail).toBeDefined();
    });

    test('EMAIL_RE nhận cùng tập email với User.email', () => {
        // Lệch nhau là chủ mời được địa chỉ mà hệ thống không tạo tài khoản được.
        //
        // So HÀNH VI chứ không so chuỗi regex. Bản đầu tôi bóc regex khỏi
        // User.js bằng /match:\s*\[(\/[^,]+\/),/ — `[^,]+` dừng ngay ở dấu phẩy
        // trong `{2,3}` nên match trả null và test đỏ oan. So bằng đầu vào thật
        // cũng bền hơn: đổi regex mà giữ nguyên tập chấp nhận thì không đỏ vô cớ.
        const User = require('../models/User');
        const userPath = User.schema.path('email');
        const userRe = userPath.validators.find(v => v.regexp)?.regexp;
        expect(userRe).toBeInstanceOf(RegExp);

        const cases = [
            'a@b.com', 'nvietanh093@gmail.com', 'first.last@sub.domain.vn',
            'khong-phai-email', '', 'a@b', '@b.com', 'a@.com', 'a b@c.com',
        ];
        for (const c of cases) {
            expect([c, EMAIL_RE.test(c)]).toEqual([c, userRe.test(c)]);
        }
    });
});

describe('shareSource — cấp quyền', () => {
    test('kiểm SỞ HỮU trước khi tạo grant', () => {
        const body = bodyOf('shareSource');
        // Không có bước này thì đoán đúng tên `source` là cấp được quyền trên bộ
        // của người khác.
        expect(body).toMatch(/UserUpload\.exists\(\{\s*ownerEmail\s*,\s*source\s*\}\)/);
        // Và phải xảy ra TRƯỚC khi ghi grant.
        expect(body.indexOf('UserUpload.exists')).toBeLessThan(body.indexOf('VocabShare.findOneAndUpdate'));
    });

    test('ownerEmail lấy từ req.user, KHÔNG từ body/params', () => {
        const body = bodyOf('shareSource');
        expect(body).toMatch(/const ownerEmail = req\.user\.email/);
        expect(body).not.toMatch(/ownerEmail\s*=\s*req\.(body|params)/);
    });

    test('chặn tự chia sẻ cho chính mình', () => {
        expect(bodyOf('shareSource')).toMatch(/granteeEmail === ownerEmail/);
    });

    test('nhận ID người chơi, KHÔNG nhận email', () => {
        // Chủ bộ từ không cần biết email của ai. Nhận email thì màn hình này thành
        // công cụ dò: phản hồi khác nhau giữa "có tài khoản" và "không có" đã lộ
        // thông tin. ID lấy sẵn từ nút "Sao chép ID" ở Bảng xếp hạng.
        const body = bodyOf('shareSource');
        expect(body).toMatch(/req\.body\?\.granteeId/);
        expect(body).not.toMatch(/req\.body\?\.granteeEmail/);
    });

    test('validate ID hợp lệ trước khi chạm DB', () => {
        const body = bodyOf('shareSource');
        expect(body).toMatch(/ObjectId\.isValid\(granteeId\)/);
        expect(body.indexOf('isValid')).toBeLessThan(body.indexOf('User.findById'));
    });

    test('KHÔNG trả email người nhận về client', () => {
        // Cả mục đích của việc đổi sang ID.
        const body = bodyOf('shareSource');
        expect(body).not.toMatch(/message:\s*`[^`]*\$\{granteeEmail\}/);
    });

    test('chia sẻ lại là không-thao-tác (upsert), không phải lỗi', () => {
        expect(bodyOf('shareSource')).toMatch(/upsert:\s*true/);
    });
});

describe('unshareSource — thu hồi', () => {
    test('nhận ID trên URL, không phải email', () => {
        const body = bodyOf('unshareSource');
        expect(body).toMatch(/req\.params\.granteeId/);
        expect(body).not.toMatch(/req\.params\.granteeEmail/);
    });

    test('LỌC KÈM ownerEmail — nếu không ai cũng thu hồi được của người khác', () => {
        const body = bodyOf('unshareSource');
        expect(body).toMatch(/deleteOne\(\{\s*ownerEmail\s*,\s*source\s*,\s*granteeEmail\s*\}\)/);
    });

    test('không tìm thấy thì 404, không im lặng báo thành công', () => {
        const body = bodyOf('unshareSource');
        expect(body).toMatch(/deletedCount === 0/);
        expect(body).toMatch(/status\(404\)/);
    });
});

describe('listSharees — xem ai đang được chia sẻ', () => {
    test('chỉ liệt kê grant của CHÍNH chủ gọi', () => {
        expect(bodyOf('listSharees')).toMatch(/find\(\{\s*ownerEmail\s*,\s*source\s*\}\)/);
    });

    test('trả TÊN + ID, KHÔNG trả email người nhận', () => {
        const body = bodyOf('listSharees');
        expect(body).toMatch(/granteeId:/);
        expect(body).toMatch(/name:/);
        // Mảng trả về không được mang trường email.
        expect(body).not.toMatch(/granteeEmail:\s*r\.granteeEmail/);
    });
});

describe('route', () => {
    test('cả ba route đều có protect', () => {
        expect(routes).toMatch(/router\.post\(\s*['"]\/share\/:source['"]\s*,\s*protect\s*,\s*shareSource/);
        expect(routes).toMatch(/router\.delete\(\s*['"]\/share\/:source\/:granteeId['"]\s*,\s*protect\s*,\s*unshareSource/);
        expect(routes).toMatch(/router\.get\(\s*['"]\/share\/:source['"]\s*,\s*protect\s*,\s*listSharees/);
    });

    test('tự kiểm: bộ dò đọc được nội dung thật', () => {
        // Thiếu ca này thì mọi expect ở trên xanh kể cả khi đọc phải chuỗi rỗng.
        expect(controller.length).toBeGreaterThan(3000);
        expect(bodyOf('shareSource').length).toBeGreaterThan(300);
    });
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
