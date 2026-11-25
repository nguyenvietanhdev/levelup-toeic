/**
 * Học qua bài hát (server).
 *
 * Chỗ dễ hỏng: người ngoài danh sách vẫn dùng được (app mở công khai, lời có bản quyền); link
 * YouTube dạng youtu.be / shorts / music không nhận ra; đọc LRC sai mốc (điệp khúc nhiều mốc,
 * dòng rỗng là đoạn nhạc), mất mốc từng chữ; mốc "Bấm theo nhịp" giảm dần vẫn lưu.
 */
const mockDb = { bai: [] };
jest.mock('../models/BaiHat', () => ({
    countDocuments: jest.fn(async () => mockDb.bai.length),
    create: jest.fn(async (d) => { const x = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', ...d }; mockDb.bai.push(x); return x; }),
    findOne: jest.fn(() => ({ lean: async () => mockDb.bai[0] || null })),
    updateOne: jest.fn(async (q, u) => { Object.assign(mockDb.bai[0], u.$set); return { matchedCount: 1 }; }),
    deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
    find: jest.fn(() => ({ sort: () => ({ lean: async () => mockDb.bai }) })),
}));
const BaiHat = require('../models/BaiHat');
const S = require('../services/baiHat');

const LRC = [
    '[ar:Ai do]',
    '[00:12.50]When I find myself in times of trouble',
    '[00:18.00][01:05.00]Let it be',
    '[00:21.00]',
    '[00:30.00]Whisper words of wisdom',
].join('\n');

let fetchCu;
beforeEach(() => {
    mockDb.bai = [];
    jest.clearAllMocks();
    fetchCu = global.fetch;
});
afterEach(() => { global.fetch = fetchCu; });
const giaFetch = (data, status = 200) => { global.fetch = jest.fn(async () => ({ ok: status < 400, status, json: async () => data })); };

describe('quyền dùng', () => {
    test('chỉ email trong BAI_HAT_EMAILS, không phân biệt hoa thường; không đặt biến = tắt hết', () => {
        expect(S.duocDung('Toi@Example.com', 'a@b.c, toi@example.com')).toBe(true);
        expect(S.duocDung('khac@example.com', 'toi@example.com')).toBe(false);
        expect(S.duocDung('toi@example.com', '')).toBe(false);
        expect(S.duocDung('', 'toi@example.com')).toBe(false);
    });

    test('cờ admin bật trên tài khoản HOẶC email trong biến môi trường', () => {
        expect(S.coQuyen({ email: 'a@x.com', duocDungBaiHat: true }, '')).toBe(true);
        expect(S.coQuyen({ email: 'a@x.com', duocDungBaiHat: false }, 'a@x.com')).toBe(true);
        expect(S.coQuyen({ email: 'a@x.com', duocDungBaiHat: false }, 'b@x.com')).toBe(false);
        expect(S.coQuyen(undefined, 'a@x.com')).toBe(false);
    });

    test('middleware xác thực mang sẵn cờ (không tốn thêm truy vấn mỗi request)', () => {
        const fs = require('fs');
        const path = require('path');
        const auth = fs.readFileSync(path.join(__dirname, '..', 'middleware', 'auth.js'), 'utf8');
        expect(auth).toMatch(/duocDungBaiHat: user\.duocDungBaiHat === true/);
    });
});

describe('link YouTube', () => {
    test.each([
        ['https://www.youtube.com/watch?v=QDYfEBY9NM4&t=10', 'QDYfEBY9NM4'],
        ['https://youtu.be/QDYfEBY9NM4?si=x', 'QDYfEBY9NM4'],
        ['https://m.youtube.com/watch?v=QDYfEBY9NM4', 'QDYfEBY9NM4'],
        ['https://music.youtube.com/watch?v=QDYfEBY9NM4', 'QDYfEBY9NM4'],
        ['https://www.youtube.com/shorts/QDYfEBY9NM4', 'QDYfEBY9NM4'],
        ['https://www.youtube.com/embed/QDYfEBY9NM4', 'QDYfEBY9NM4'],
        ['QDYfEBY9NM4', 'QDYfEBY9NM4'],
        ['https://vimeo.com/123', ''],
        ['https://www.youtube.com/watch?v=ngan', ''],
        ['khong phai link', ''],
    ])('%s', (link, id) => expect(S.tachYoutubeId(link)).toBe(id));
});

describe('đọc LRC', () => {
    test('mỗi dòng có mốc đầu/cuối; dòng rỗng chỉ đặt điểm kết thúc; điệp khúc nhiều mốc tách thành nhiều dòng', () => {
        const c = S.docLrc(LRC, 120);
        expect(c.map((x) => [x.batDau, x.ketThuc, x.text])).toEqual([
            [12.5, 18, 'When I find myself in times of trouble'],
            [18, 21, 'Let it be'],
            [30, 65, 'Whisper words of wisdom'],
            [65, 120, 'Let it be'],
        ]);
    });

    test('mốc từng chữ (LRC mở rộng) được giữ, lần lặp sau dời theo mốc của nó', () => {
        const c = S.docLrc('[00:10.00][00:40.00]<00:10.00>Let <00:10.50>it <00:11.00>be', 60);
        expect(c[0].text).toBe('Let it be');
        expect(c[0].tu).toEqual([{ batDau: 10, text: 'Let ' }, { batDau: 10.5, text: 'it ' }, { batDau: 11, text: 'be' }]);
        expect(c[1].tu.map((t) => t.batDau)).toEqual([40, 40.5, 41]);
    });

    test('lời thường: bỏ dòng trống và thẻ, không có mốc', () => {
        expect(S.tachLoiThuong('Dòng một\n\n[Chorus]\nDòng hai')).toEqual([
            { batDau: null, ketThuc: null, text: 'Dòng một' },
            { batDau: null, ketThuc: null, text: 'Dòng hai' },
        ]);
    });
});

describe('Bấm theo nhịp', () => {
    const cau = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
    test('đủ mốc, tăng dần: dòng kết thúc ở mốc dòng sau', () => {
        expect(S.apMoc(cau, [1, 3.456, 7], 20)).toEqual([
            { text: 'a', batDau: 1, ketThuc: 3.46 },
            { text: 'b', batDau: 3.46, ketThuc: 7 },
            { text: 'c', batDau: 7, ketThuc: 20 },
        ]);
    });
    test('thiếu mốc, giảm dần, âm: từ chối', () => {
        expect(S.apMoc(cau, [1, 2], 0)).toMatch(/đủ/);
        expect(S.apMoc(cau, [1, 5, 3], 0)).toMatch(/tăng dần/);
        expect(S.apMoc(cau, [-1, 2, 3], 0)).toMatch(/không hợp lệ/);
    });
    test('lưu mốc: bật coMoc, đặt lại độ lệch', async () => {
        mockDb.bai = [{ _id: 'x', userId: 'u1', cau, thoiLuong: 10, lech: 2 }];
        await S.capNhat('u1', 'x', { moc: [0, 1, 2] });
        expect(BaiHat.updateOne).toHaveBeenCalledWith({ _id: 'x', userId: 'u1' }, { $set: expect.objectContaining({ coMoc: true, lech: 0 }) });
    });
    test('độ lệch ngoài ±120 giây bị từ chối (đoạn dạo đầu của bản video có thể dài hơn cả phút)', async () => {
        mockDb.bai = [{ _id: 'x', userId: 'u1', cau }];
        expect(await S.capNhat('u1', 'x', { lech: 150 })).toMatchObject({ ma: 400 });
        expect(await S.capNhat('u1', 'x', { lech: 45 })).toHaveProperty('bai');
    });
    test('mốc chỉnh từng đoạn: dòng có thật, mỗi dòng một mốc, sắp tăng dần', () => {
        expect(S.chuanHoaLechTu([{ dong: 2, lech: 1.234 }, { dong: 0, lech: -0.5 }, { dong: 2, lech: 1.5 }], 3))
            .toEqual([{ dong: 0, lech: -0.5 }, { dong: 2, lech: 1.5 }]);
        expect(S.chuanHoaLechTu([{ dong: 3, lech: 1 }], 3)).toMatch(/dòng không có/);
        expect(S.chuanHoaLechTu([{ dong: 0, lech: 500 }], 3)).toMatch(/±120/);
        expect(S.chuanHoaLechTu('x', 3)).toMatch(/không hợp lệ/);
    });
    test('lưu mốc chỉnh; bấm lại nhịp thì xoá hết mốc chỉnh cũ', async () => {
        mockDb.bai = [{ _id: 'x', userId: 'u1', cau, thoiLuong: 10 }];
        await S.capNhat('u1', 'x', { lechTu: [{ dong: 1, lech: 2 }] });
        expect(BaiHat.updateOne).toHaveBeenLastCalledWith({ _id: 'x', userId: 'u1' }, { $set: { lechTu: [{ dong: 1, lech: 2 }] } });
        await S.capNhat('u1', 'x', { moc: [0, 1, 2] });
        expect(BaiHat.updateOne).toHaveBeenLastCalledWith({ _id: 'x', userId: 'u1' }, { $set: expect.objectContaining({ lechTu: [], lech: 0 }) });
    });
});

describe('tìm và thêm bài', () => {
    test('tìm lời: bản có mốc xếp trước, bỏ bản nhạc không lời', async () => {
        giaFetch([
            { id: 1, trackName: 'Let It Be', artistName: 'B', duration: 230, plainLyrics: 'x', syncedLyrics: null },
            { id: 2, trackName: 'Let It Be', artistName: 'B', duration: 231, plainLyrics: 'x', syncedLyrics: '[00:01.00]x' },
            { id: 3, trackName: 'Let It Be (Instrumental)', instrumental: true },
        ]);
        const r = await S.timLoi({ tenBai: 'Let It Be', ngheSi: 'The Beatles' });
        expect(r.ketQua.map((x) => [x.id, x.coMoc])).toEqual([[2, true], [1, false]]);
        expect(global.fetch.mock.calls[0][0]).toBe('https://lrclib.net/api/search?track_name=Let+It+Be&artist_name=The+Beatles');
    });

    test('kho lời lỗi mạng: báo thử lại, không sập', async () => {
        global.fetch = jest.fn(async () => { throw new Error('timeout'); });
        expect(await S.timLoi({ tenBai: 'x' })).toMatchObject({ ma: 503 });
    });

    test('thêm bài từ LRCLIB: lời có mốc, tên lấy từ kho nếu chưa nhập, đoán ngôn ngữ', async () => {
        giaFetch({ id: 2, trackName: 'Let It Be', artistName: 'The Beatles', duration: 120, syncedLyrics: LRC });
        const r = await S.themBai('u1', { youtube: 'https://youtu.be/QDYfEBY9NM4', lrclibId: 2 });
        expect(r.bai).toMatchObject({ youtubeId: 'QDYfEBY9NM4', tieuDe: 'Let It Be', ngheSi: 'The Beatles', coMoc: true, lang: 'en', nguonLoi: 'lrclib', soDong: 4 });
        giaFetch({ id: 3, trackName: '月亮代表我的心', duration: 200, syncedLyrics: '[00:10.00]你问我爱你有多深' });
        expect((await S.themBai('u1', { youtube: 'QDYfEBY9NM4', lrclibId: 3 })).bai.lang).toBe('zh');
    });

    test('lời tiếng Nhật / Hàn (ngôn ngữ chưa mở): báo chưa hỗ trợ, không gán nhầm sang tiếng Trung', async () => {
        // Kanji nằm cùng dải chữ Hán: trước đây lời tiếng Nhật bị nhận là tiếng Trung, pinyin sai.
        const nhat = await S.themBai('u1', { youtube: 'QDYfEBY9NM4', tieuDe: 'x', loiDan: '君の名前を教えて\n夜空に星が光る' });
        expect(nhat).toMatchObject({ ma: 400 });
        expect(nhat.loi).toMatch(/tiếng nhật/);
        const han = await S.themBai('u1', { youtube: 'QDYfEBY9NM4', tieuDe: 'x', loiDan: '사랑해요\n보고 싶어' });
        expect(han.loi).toMatch(/tiếng hàn/);
        expect(BaiHat.create).not.toHaveBeenCalled();
        // Tiếng Trung vẫn nhận như cũ.
        expect((await S.themBai('u1', { youtube: 'QDYfEBY9NM4', tieuDe: 'x', loiDan: '月亮代表我的心' })).bai.lang).toBe('zh');
    });

    test('tự dán lời: chưa có mốc; link sai và lời rỗng bị từ chối', async () => {
        const r = await S.themBai('u1', { youtube: 'QDYfEBY9NM4', tieuDe: 'Bài của tôi', loiDan: 'Dòng một\nDòng hai' });
        expect(r.bai).toMatchObject({ coMoc: false, nguonLoi: 'tu-dan', soDong: 2 });
        expect(await S.themBai('u1', { youtube: 'https://vimeo.com/1', loiDan: 'x', tieuDe: 'x' })).toMatchObject({ ma: 400 });
        expect(await S.themBai('u1', { youtube: 'QDYfEBY9NM4', tieuDe: 'x', loiDan: '  \n ' })).toMatchObject({ ma: 400 });
    });
});

describe('route', () => {
    const fs = require('fs');
    const path = require('path');
    const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'baiHat.js'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

    test('ngoài danh sách thì mọi route trừ /quyen trả 404', () => {
        const iQuyen = route.indexOf("router.get('/quyen'");
        const iChan = route.search(/router\.use\(\(req, res, next\) => \(S\.coQuyen\(req\.user\)\s*\? next\(\)/);
        expect(iQuyen).toBeGreaterThan(-1);
        expect(iChan).toBeGreaterThan(iQuyen);
        expect(route.indexOf("router.get('/tim-loi'")).toBeGreaterThan(iChan);
    });

    test('đã gắn vào server; CSP cho trình phát YouTube nhúng', () => {
        expect(server).toContain("app.use('/api/bai-hat', require('./routes/baiHat'))");
        expect(server).toMatch(/frameSrc: \[[^\]]*https:\/\/www\.youtube-nocookie\.com/);
        expect(server).toMatch(/scriptSrcElem: \[[^\]]*https:\/\/www\.youtube\.com/);
        // Không có referrer thì YouTube nhúng báo "Video này không hoạt động" cho mọi video.
        expect(server).toContain("referrerPolicy: { policy: 'strict-origin-when-cross-origin' }");
    });
});

describe('admin: quản lý tài khoản được dùng', () => {
    const fs = require('fs');
    const path = require('path');
    const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminDefinitions.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'partials', 'tabs', 'feature-unlocks.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'js', 'features', 'economy', 'feature-unlock-admin.js'), 'utf8');

    test('route xem / thêm / gỡ, chỉ admin', () => {
        expect(route).toMatch(/router\.get\('\/bai-hat-quyen', admin,/);
        expect(route).toMatch(/router\.post\('\/bai-hat-quyen', admin,/);
        expect(route).toMatch(/router\.delete\('\/bai-hat-quyen\/:userId', admin,/);
        // Thêm chỉ nhận tài khoản có thật; gỡ chỉ tắt cờ, báo rõ nếu email còn trong biến môi trường.
        expect(route).toMatch(/Không tìm thấy tài khoản/);
        expect(route).toMatch(/còn trong BAI_HAT_EMAILS/);
    });

    test('khối giao diện trong tab Mở khoá theo Level: email qua esc(), gỡ luôn hỏi lại', () => {
        for (const id of ['bh-quyen-form', 'bh-quyen-email', 'bh-quyen-tbody']) expect(html).toContain(`id="${id}"`);
        expect(js).toMatch(/<td><strong>\$\{esc\(u\.email\)\}<\/strong><\/td>/);
        expect(js).toMatch(/if \(!confirm\(`Gỡ quyền dùng Học qua bài hát/);
        expect(js).toMatch(/initBaiHatQuyen\(\)/);
        expect(js).toMatch(/loadBaiHatQuyen\(\);\n  \};/);
    });
});
