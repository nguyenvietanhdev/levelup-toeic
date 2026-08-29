/**
 * Khung giờ chạy chế độ — phần nối dây: middleware chặn, route admin, tab admin.
 *
 * Logic thuần đã có `modeSchedule.test.js`. File này chốt những chỗ mà logic
 * đúng nhưng vẫn hỏng vì nối thiếu:
 *   · middleware không được gắn vào `/practice/start` → giao diện khoá mà API
 *     vẫn cho chạy, tức là sửa client là lách được;
 *   · tab admin thiếu một trong năm điểm nối → mở ra thấy trang trắng.
 */
const fs = require('fs');
const path = require('path');

const { requireInSchedule } = require('../services/modeSchedule');
const { renderAdminDashboard } = require('../utils/renderAdminDashboard');

const F = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/** `res` giả, ghi lại status + body. */
const dungRes = () => {
    const res = { code: 200, body: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};

describe('middleware chặn ngoài giờ', () => {
    /** Mock `ModeSchedule.findOne(...).lean()`. */
    const gaLich = (lich) => {
        jest.resetModules();
        jest.doMock('../models/ModeSchedule', () => ({
            findOne: () => ({ lean: () => Promise.resolve(lich) }),
        }));
        return require('../services/modeSchedule').requireInSchedule;
    };

    afterEach(() => { jest.dontMock('../models/ModeSchedule'); jest.resetModules(); });

    test('trong giờ → cho qua', async () => {
        const mw = gaLich({ isActive: true, days: [], start: 0, end: 1440 });
        const res = dungRes();
        const next = jest.fn();
        await mw(r => r.body.mode)({ body: { mode: 'speed-quiz' }, user: {} }, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.body).toBeNull();
    });

    test('ngoài giờ → 403 kèm mô tả khung giờ', async () => {
        // Khung rỗng = không giờ nào hợp lệ, dùng làm ca "chắc chắn đóng".
        const mw = gaLich({ isActive: true, days: [], start: 600, end: 600 });
        const res = dungRes();
        const next = jest.fn();
        await mw(r => r.body.mode)({ body: { mode: 'speed-quiz' }, user: {} }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.code).toBe(403);
        expect(res.body.success).toBe(false);
        // Cờ RIÊNG, không dùng chung `locked` của khoá Level: hai loại khoá cần
        // hai lời nhắc khác nhau (một cái bảo cày thêm, một cái bảo chờ).
        expect(res.body.lockedBySchedule).toBe(true);
        expect(typeof res.body.schedule).toBe('string');
    });

    test('chưa cấu hình → cho qua', async () => {
        const mw = gaLich(null);
        const next = jest.fn();
        await mw(r => r.body.mode)({ body: { mode: 'x' }, user: {} }, dungRes(), next);
        expect(next).toHaveBeenCalled();
    });

    test('không có mode trong request → cho qua, không tra DB', async () => {
        const mw = gaLich({ isActive: true, days: [], start: 600, end: 600 });
        const next = jest.fn();
        await mw(r => r.body.mode)({ body: {}, user: {} }, dungRes(), next);
        expect(next).toHaveBeenCalled();
    });

    test('tài khoản ngoại lệ bỏ qua khung giờ', async () => {
        // Đã miễn mốc Level thì cũng nên miễn khung giờ — buổi demo rơi vào 3
        // giờ sáng mà không mở được gì thì vô nghĩa.
        const mw = gaLich({ isActive: true, days: [], start: 600, end: 600 });
        const next = jest.fn();
        await mw(r => r.body.mode)(
            { body: { mode: 'speed-quiz' }, user: { bypassFeatureLock: true } },
            dungRes(), next,
        );
        expect(next).toHaveBeenCalled();
    });
});

describe('gắn vào đường vào THẬT của lượt luyện tập', () => {
    // Chuẩn hoá CRLF: file nguồn dùng xuống dòng kiểu Windows nên mẫu nhiều
    // dòng viết trong test sẽ không bao giờ khớp.
    const routes = F('routes', 'practice.js').split(String.fromCharCode(13)).join('');

    test('`/practice/start` có `requireInSchedule`', () => {
        // Không gắn thì giao diện khoá mà API vẫn chạy — sửa client là lách được.
        const i = routes.indexOf("router.post(\n    '/start'");
        expect(i).toBeGreaterThan(-1);
        const khoi = routes.slice(i, routes.indexOf(');', i));
        expect(khoi).toMatch(/requireInSchedule\(/);
    });

    test('đứng CẠNH `requireLevel`, không thay thế nó', () => {
        const i = routes.indexOf("router.post(\n    '/start'");
        const khoi = routes.slice(i, routes.indexOf(');', i));
        expect(khoi).toMatch(/requireLevel\(/);
        expect(khoi.indexOf('requireLevel')).toBeLessThan(khoi.indexOf('requireInSchedule'));
    });
});

describe('route admin', () => {
    const admin = F('routes', 'adminDefinitions.js');

    test('có GET / PUT / DELETE cho mode-schedules', () => {
        expect(admin).toMatch(/router\.get\('\/mode-schedules'/);
        expect(admin).toMatch(/router\.put\('\/mode-schedules\/:mode'/);
        expect(admin).toMatch(/router\.delete\('\/mode-schedules\/:mode'/);
    });

    test('PUT dùng upsert theo `mode`', () => {
        // Khoá là `mode`, mỗi chế độ đúng một bản ghi. Không upsert thì admin
        // phải biết bản ghi đã tồn tại chưa, và dễ đẻ ra hai lịch cho một chế độ.
        const i = admin.indexOf("router.put('/mode-schedules/:mode'");
        const khoi = admin.slice(i, admin.indexOf('\n});', i));
        expect(khoi).toMatch(/findOneAndUpdate/);
        expect(khoi).toMatch(/upsert: true/);
    });

    test('KẸP giá trị client gửi lên', () => {
        // `start`/`end` vượt 1440 thì mọi phép so giờ lệch mà không có lỗi nào;
        // `days` lạc ngoài 0–6 thì lịch im lặng không bao giờ khớp.
        const i = admin.indexOf("router.put('/mode-schedules/:mode'");
        const khoi = admin.slice(i, admin.indexOf('\n});', i));
        expect(khoi).toMatch(/Math\.min\(1440/);
        expect(khoi).toMatch(/d >= 0 && d <= 6/);
    });

    test('danh sách chế độ lấy từ `PRACTICE_COSTS`, không khai lại', () => {
        // Khai lại 17 id ở giao diện admin là chép tay: thêm chế độ mới thì
        // bảng thiếu một dòng mà không có gì báo.
        const i = admin.indexOf("router.get('/mode-schedules'");
        const khoi = admin.slice(i, admin.indexOf('\n});', i));
        expect(khoi).toMatch(/Object\.keys\(PRACTICE_COSTS\)/);
    });
});

describe('endpoint cho client', () => {
    const feats = F('routes', 'features.js');

    test('có `/schedules`', () => {
        expect(feats).toMatch(/router\.get\('\/schedules'/);
    });

    test('trả `dangMo` tính ở SERVER', () => {
        // Client tự tính thì máy lệch múi giờ là giao diện báo "đang mở" mà
        // `/practice/start` từ chối.
        const i = feats.indexOf("router.get('/schedules'");
        const khoi = feats.slice(i, feats.indexOf('\n});', i));
        expect(khoi).toMatch(/dangMo: bypass \|\| dangMo\(l\)/);
    });

    test('trả kèm `moTa` để client khỏi chép luật dựng chuỗi', () => {
        const i = feats.indexOf("router.get('/schedules'");
        const khoi = feats.slice(i, feats.indexOf('\n});', i));
        expect(khoi).toMatch(/moTa: moTa\(l\)/);
    });
});

describe('tab admin nối đủ NĂM điểm', () => {
    const html = renderAdminDashboard();

    test('phần thân tab có trong HTML đã render', () => {
        // Thiếu thì mọi handler nối vào id không tồn tại, và `?.` nuốt im lặng.
        expect(html).toContain('main-tab-mode-schedules');
        expect(html).toContain('sched-tbody');
    });

    test('có mục ở thanh bên', () => {
        expect(html).toContain('data-main-tab="mode-schedules"');
    });

    test('file JS được nạp', () => {
        expect(html).toContain('mode-schedule-admin.js');
    });

    test('`ui-init` biết tiêu đề và biết gọi hàm nạp', () => {
        const ui = F('public', 'admin', 'js', 'core', 'ui-init.js');
        expect(ui).toMatch(/'mode-schedules':\s*'Khung giờ chạy chế độ'/);
        expect(ui).toMatch(/window\.loadModeSchedules\?\.\(\)/);
    });

    test('file JS công bố đúng tên hàm mà `ui-init` gọi', () => {
        // Lệch tên là tab mở ra trống trơn, không lỗi nào trong console.
        const js = F('public', 'admin', 'js', 'features', 'economy', 'mode-schedule-admin.js');
        expect(js).toMatch(/window\.loadModeSchedules = /);
    });
});
