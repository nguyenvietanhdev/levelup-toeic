/**
 * Quản lý nội dung AI đã lưu (admin).
 *
 * Chỗ dễ hỏng: nội dung nhập tay lọt qua mà không qua bước kiểm như nội dung AI (câu chọn 3 lựa
 * chọn, đáp án không nằm trong lựa chọn, ví dụ tiếng Việt ở chỗ câu ngoại ngữ); "xoá" câu luyện
 * ngữ pháp rút câu khỏi mảng làm lệch vị trí mà lượt đang làm trỏ tới; sửa câu đang ẩn làm nó
 * hiện lại; loại chỉ xem được lại sửa/xoá được qua API; admin panel không nối được tab.
 */
const fs = require('fs');
const path = require('path');

const mockDb = { muc: [], bo: [], cauOn: [], vai: [] };
const chuoi = (ds) => {
    const c = { select: () => c, sort: () => c, skip: () => c, limit: () => c, lean: async () => ds() };
    return c;
};
jest.mock('../models/NguPhapMuc', () => ({
    find: jest.fn(() => chuoi(() => mockDb.muc)),
    findOne: jest.fn((q) => chuoi(() => mockDb.muc.find((d) => (q._id ? String(d._id) === String(q._id) : d.khoa === q.khoa)) || null)),
    countDocuments: jest.fn(async () => mockDb.muc.length),
    create: jest.fn(async (d) => ({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', ...d })),
    updateOne: jest.fn(async () => ({ matchedCount: 1 })),
    deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
}));
jest.mock('../models/NguPhapBaiTap', () => ({
    find: jest.fn(() => chuoi(() => mockDb.bo)),
    findOne: jest.fn((q) => chuoi(() => mockDb.bo.find((b) => b.mucId === q.mucId) || null)),
    findOneAndUpdate: jest.fn(async () => ({})),
    updateOne: jest.fn(async () => ({ matchedCount: 1 })),
}));
jest.mock('../models/NguPhapNhap', () => ({ find: jest.fn(() => chuoi(() => [])), countDocuments: jest.fn(async () => 0), deleteOne: jest.fn() }));
jest.mock('../models/CauLuyenLoi', () => ({
    find: jest.fn(() => chuoi(() => mockDb.cauOn)), countDocuments: jest.fn(async () => 0),
    create: jest.fn(async (d) => ({ _id: 'c1', ...d })), updateOne: jest.fn(async () => ({ matchedCount: 1 })), deleteOne: jest.fn(),
}));
jest.mock('../models/AiRole', () => ({
    find: jest.fn(() => chuoi(() => mockDb.vai)), countDocuments: jest.fn(async () => 0),
    create: jest.fn(async (d) => ({ _id: 'r1', ...d })), updateOne: jest.fn(async () => ({ matchedCount: 1 })), deleteOne: jest.fn(),
}));
jest.mock('../models/DangGoiY', () => ({ find: jest.fn(() => chuoi(() => [])), countDocuments: jest.fn(async () => 0), updateOne: jest.fn(async () => ({ matchedCount: 1 })), deleteOne: jest.fn() }));
jest.mock('../models/TongKetTuan', () => ({ find: jest.fn(() => chuoi(() => [])), countDocuments: jest.fn(async () => 0), deleteOne: jest.fn() }));
jest.mock('../models/User', () => ({ find: jest.fn(() => chuoi(() => [])) }));
jest.mock('../services/nguPhapQuanTri', () => ({ anMuc: jest.fn(async () => ({ daBao: true })) }));

const NguPhapMuc = require('../models/NguPhapMuc');
const NguPhapBaiTap = require('../models/NguPhapBaiTap');
const CauLuyenLoi = require('../models/CauLuyenLoi');
const AiRole = require('../models/AiRole');
const { anMuc } = require('../services/nguPhapQuanTri');
const S = require('../services/noiDungAi');
const { MUC } = require('../services/nguPhapKho');

const EN = MUC.find((m) => m.lang === 'en');
const ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

beforeEach(() => {
    Object.assign(mockDb, { muc: [], bo: [], cauOn: [], vai: [] });
    jest.clearAllMocks();
});

describe('danh sách loại', () => {
    test('đủ các kho nội dung AI, mỗi loại có cột và cách xoá rõ ràng', () => {
        const ds = S.danhSachLoai();
        expect(ds.map((l) => l.key)).toEqual(['muc-ngu-phap', 'cau-ngu-phap', 'vi-du-ngu-phap', 'cach-goi', 'nhap-ngu-phap', 'cau-on-loi', 'vai-ai', 'dang-goi-y', 'tong-ket-tuan']);
        for (const l of ds) {
            expect(l.cot.length).toBeGreaterThan(0);
            expect(['xoa', 'an', 'an-muc']).toContain(l.xoa);
        }
        expect(ds.find((l) => l.key === 'cau-ngu-phap').xoa).toBe('an');
    });

    test('loại chỉ xem không sửa/thêm được qua API; loại lạ bị từ chối', async () => {
        expect(await S.lam('tong-ket-tuan', 'capNhat', ID, {})).toMatchObject({ ma: 405 });
        expect(await S.lam('tong-ket-tuan', 'tao', {})).toMatchObject({ ma: 405 });
        expect(await S.lam('cau-ngu-phap', 'xoaMuc', `${EN.id}~0`)).toMatchObject({ ma: 405 });
        expect(await S.lam('khong-co', 'ds', {})).toMatchObject({ ma: 404 });
    });
});

describe('câu luyện ngữ pháp', () => {
    test('kiểm câu nhập tay như câu AI', () => {
        const ok = { de: 'She ___ home.', lua: 'went | go | gone | going', dapAn: 'went', giaiThich: 'Quá khứ.' };
        expect(S.kiemCauLuyen('chon', ok)).toMatchObject({ loai: 'chon', lua: ['went', 'go', 'gone', 'going'] });
        expect(S.kiemCauLuyen('chon', { ...ok, lua: 'went | go | gone' })).toMatch(/4 lựa chọn/);
        expect(S.kiemCauLuyen('chon', { ...ok, dapAn: 'goes' })).toMatch(/Đáp án/);
        expect(S.kiemCauLuyen('chon', { ...ok, giaiThich: '' })).toMatch(/giải thích/);
        expect(S.kiemCauLuyen('sua', { sai: 'He go.', dung: 'He go.', vi: 'Anh ấy đi.', giaiThich: 'x' })).toMatch(/khác/);
        expect(S.kiemCauLuyen('dich', { vi: 'Tôi ăn.', dung: 'Tôi ăn cơm.', giaiThich: 'x' })).toMatch(/ngoại ngữ/);
        expect(S.kiemCauLuyen('dich', { vi: 'Tôi ăn.', dung: 'I eat.', giaiThich: 'x' }, 'zh')).toMatch(/chữ Hán/);
    });

    test('ẩn/hiện chỉ đặt cờ `an`, không rút câu khỏi mảng', async () => {
        await S.lam('cau-ngu-phap', 'datAn', `${EN.id}~3`, true);
        expect(NguPhapBaiTap.updateOne).toHaveBeenCalledWith(
            { mucId: EN.id, 'cau.3': { $exists: true } },
            { $set: { 'cau.3.an': true } },
        );
    });

    test('sửa câu đang ẩn vẫn giữ ẩn; dạng câu giữ như cũ', async () => {
        mockDb.bo = [{ mucId: EN.id, cau: [{ loai: 'dich', vi: 'a', dung: 'b', giaiThich: 'c', an: true }] }];
        const r = await S.lam('cau-ngu-phap', 'capNhat', `${EN.id}~0`, { loai: 'chon', vi: 'Tôi đã đi.', dung: 'I went.', giaiThich: 'Quá khứ.' });
        expect(r).toEqual({ id: `${EN.id}~0` });
        expect(NguPhapBaiTap.updateOne).toHaveBeenCalledWith({ mucId: EN.id }, { $set: { 'cau.0': { loai: 'dich', vi: 'Tôi đã đi.', dung: 'I went.', giaiThich: 'Quá khứ.', an: true } } });
    });

    test('thêm câu: phải chọn chủ điểm có thật; nối vào cuối bộ câu', async () => {
        expect(await S.lam('cau-ngu-phap', 'tao', { mucId: 'khong-co', loai: 'dich' })).toMatchObject({ ma: 400 });
        await S.lam('cau-ngu-phap', 'tao', { mucId: EN.id, loai: 'dich', vi: 'Tôi đã đi.', dung: 'I went.', giaiThich: 'Quá khứ.' });
        expect(NguPhapBaiTap.findOneAndUpdate).toHaveBeenCalledWith({ mucId: EN.id }, { $push: { cau: expect.objectContaining({ loai: 'dich', dung: 'I went.' }) } }, expect.anything());
    });

    test('liệt kê: lọc theo ngôn ngữ của chủ điểm và chữ tìm; câu ẩn được đánh dấu', async () => {
        const ZH = MUC.find((m) => m.lang === 'zh');
        mockDb.bo = [
            { mucId: EN.id, cau: [{ loai: 'dich', vi: 'Tôi đi.', dung: 'I go.', giaiThich: 'x', an: true }, { loai: 'dich', vi: 'Tôi ăn.', dung: 'I eat.', giaiThich: 'x' }] },
            { mucId: ZH.id, cau: [{ loai: 'dich', vi: 'Tôi ăn.', dung: '我吃。', giaiThich: 'x' }] },
        ];
        const r = await S.lam('cau-ngu-phap', 'ds', { lang: 'en' });
        expect(r.tong).toBe(2);
        expect(r.ds[0]).toMatchObject({ id: `${EN.id}~0`, an: true, cot: { trangThai: 'Đang ẩn' } });
        expect((await S.lam('cau-ngu-phap', 'ds', { q: 'eat' })).tong).toBe(1);
    });
});

describe('chủ điểm ngữ pháp AI', () => {
    const FORM = {
        ten: 'Câu điều kiện loại 1', lang: 'en',
        congThuc: 'Chung :: If + S + V(s/es), S + will + V',
        dung: 'Điều có thể xảy ra ở tương lai.',
        vd: 'If it rains, I will stay home. :: Nếu trời mưa, tôi sẽ ở nhà.',
        luuY: '',
    };

    test('form ↔ nội dung giữ nguyên dữ liệu', () => {
        const n = S.formSangMuc(FORM);
        expect(n.congThuc).toEqual([{ nhan: 'Chung', ct: 'If + S + V(s/es), S + will + V' }]);
        expect(S.mucSangForm({ ...n, vd: [{ en: 'If it rains, I will stay home.', vi: 'Nếu trời mưa, tôi sẽ ở nhà.' }] }).vd).toBe(FORM.vd);
    });

    test('thêm tay: qua cùng bước kiểm như AI; trùng tên thì từ chối', async () => {
        expect(await S.lam('muc-ngu-phap', 'tao', { ...FORM, vd: 'Nếu trời mưa :: tiếng Việt' })).toMatchObject({ ma: 400 });
        expect(await S.lam('muc-ngu-phap', 'tao', FORM)).toHaveProperty('id');
        expect(NguPhapMuc.create).toHaveBeenCalledWith(expect.objectContaining({ khoa: 'hoi:cau dieu kien loai 1', lang: 'en', tenChuan: 'cau dieu kien loai 1' }));
        mockDb.muc = [{ _id: ID, khoa: 'hoi:cau dieu kien loai 1' }];
        expect(await S.lam('muc-ngu-phap', 'tao', FORM)).toMatchObject({ ma: 409 });
    });

    test('xoá chủ điểm đi đường ẩn sẵn có (khôi phục được), không xoá hẳn', async () => {
        await S.lam('muc-ngu-phap', 'xoaMuc', ID, { adminId: 'admin1' });
        expect(anMuc).toHaveBeenCalledWith('admin1', ID);
        expect(NguPhapMuc.deleteOne).not.toHaveBeenCalled();
    });
});

describe('ví dụ, câu ôn lỗi, vai AI', () => {
    test('xoá một ví dụ: bỏ đúng ví dụ đó, giữ thứ tự phần còn lại', async () => {
        mockDb.muc = [{ _id: ID, khoa: `kho:${EN.id}`, viDuThem: [{ en: 'A.', vi: 'a' }, { en: 'B.', vi: 'b' }, { en: 'C.', vi: 'c' }] }];
        await S.lam('vi-du-ngu-phap', 'xoaMuc', `${ID}~1`);
        expect(NguPhapMuc.updateOne).toHaveBeenCalledWith({ _id: ID }, { $set: { viDuThem: [{ en: 'A.', vi: 'a' }, { en: 'C.', vi: 'c' }] } });
    });

    test('thêm ví dụ cho mục kho lõi: tạo bản ghi `kho:<id>` nếu chưa có', async () => {
        await S.lam('vi-du-ngu-phap', 'tao', { mucId: EN.id, en: 'I went home.', vi: 'Tôi đã về nhà.' });
        expect(NguPhapMuc.updateOne).toHaveBeenCalledWith({ khoa: `kho:${EN.id}` }, { $push: { viDuThem: { en: 'I went home.', vi: 'Tôi đã về nhà.' } }, $setOnInsert: { lang: 'en' } }, { upsert: true });
        expect(await S.lam('vi-du-ngu-phap', 'tao', { mucId: EN.id, en: 'Tôi về nhà.', vi: 'x' })).toMatchObject({ ma: 400 });
    });

    test('câu ôn lỗi: chỗ sai phải nằm trong câu sai và sửa xong ra đúng câu đúng', async () => {
        const ok = { loai: 'tense', lang: 'en', sai: 'Yesterday I go home.', chiSai: 'go', sua: 'went', dung: 'Yesterday I went home.', giaiThich: 'Quá khứ.' };
        expect(await S.lam('cau-on-loi', 'tao', ok)).toHaveProperty('id');
        expect(CauLuyenLoi.create).toHaveBeenCalledWith(expect.objectContaining({ loai: 'tense', lang: 'en', sai: ok.sai, dung: ok.dung }));
        expect(await S.lam('cau-on-loi', 'tao', { ...ok, sua: 'gone' })).toMatchObject({ ma: 400 });
        expect(await S.lam('cau-on-loi', 'tao', { ...ok, loai: 'bia-dat' })).toMatchObject({ ma: 400 });
    });

    test('vai AI: kiểm độ dài như khi người học lưu; trùng vai thì báo, không sập', async () => {
        expect(await S.lam('vai-ai', 'tao', { source: 'toeic', part: 'P1', title: 'Barista', text: 'ngắn' })).toMatchObject({ ma: 400 });
        const r = await S.lam('vai-ai', 'tao', { source: 'TOEIC', part: 'P1', lang: 'en', title: 'Barista at a café', text: 'You are a friendly barista taking orders from a customer at a busy café.' });
        expect(r).toHaveProperty('id');
        expect(AiRole.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'toeic', origin: 'ai', ownerId: null, hash: expect.any(String) }));
        AiRole.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
        expect(await S.lam('vai-ai', 'tao', { source: 'toeic', part: 'P1', title: 'Barista at a café', text: 'You are a friendly barista taking orders from a customer at a busy café.' })).toMatchObject({ ma: 409 });
    });

    test('xoá vai chỉ đụng vai AI, không xoá vai người học tự viết', async () => {
        await S.lam('vai-ai', 'xoaMuc', ID);
        expect(AiRole.deleteOne).toHaveBeenCalledWith({ _id: ID, origin: 'ai' });
    });
});

describe('admin panel', () => {
    const ADMIN = path.join(__dirname, '..', 'public', 'admin');
    const sidebar = fs.readFileSync(path.join(ADMIN, 'partials', 'layout', 'sidebar.html'), 'utf8');
    const ui = fs.readFileSync(path.join(ADMIN, 'js', 'core', 'ui-init.js'), 'utf8');
    const js = fs.readFileSync(path.join(ADMIN, 'js', 'features', 'ai', 'noi-dung-ai-admin.js'), 'utf8');
    const dash = fs.readFileSync(path.join(ADMIN, 'dashboard.html'), 'utf8');

    test('nhóm "Nội dung AI" trên sidebar có một mục cho mỗi loại, cùng mở một tab', () => {
        expect(sidebar).toContain('data-group="ai"');
        for (const l of S.danhSachLoai()) expect(sidebar).toContain(`data-main-tab="noi-dung-ai" data-ai-loai="${l.key}"`);
        expect(sidebar).toMatch(/id="nav-group-ai"[\s\S]*data-main-tab="ngu-phap-ai"/);
    });

    test('bấm mục sidebar truyền loại vào tab, tô đúng mục được bấm', () => {
        expect(ui).toMatch(/activateTab\(link\.dataset\.mainTab, link\)/);
        expect(ui).toMatch(/window\.loadNoiDungAi\?\.\(link\?\.dataset\.aiLoai\)/);
        expect(dash).toContain("@include('partials/tabs/noi-dung-ai.html')");
        expect(dash).toMatch(/features\/ai\/noi-dung-ai-admin\.js\?v=\d+/);
    });

    test('mọi chuỗi từ server đều qua esc(); ô nhập điền bằng .value; xoá luôn hỏi lại', () => {
        expect(js).toMatch(/esc\(c\.kieu === 'ngay' \? ngay\(h\.cot\[c\.key\]\) : h\.cot\[c\.key\]\)/);
        expect(js).toMatch(/el\.value = String\(giaTri\[t\.key\]\)/);
        expect(js).not.toMatch(/value="\$\{(?!esc\()/);
        expect(js).toMatch(/if \(!confirm\(loiNhan\)\) return;/);
    });
});
