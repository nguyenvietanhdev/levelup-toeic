/**
 * Quản trị nội dung ngữ pháp do AI tạo.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Người thường gọi được API quản trị.
 *   2. Khôi phục đè lên mục mới cùng tên → thư viện có hai mục trùng.
 *   3. Nhiều người báo một nội dung, xử lý xong vẫn còn báo cáo "chờ xử lý".
 *   4. Nội dung AI hoặc email chèn thẳng vào HTML admin → XSS trong trang quản trị.
 */
const fs = require('fs');
const path = require('path');

const mockDb = { bao: [], muc: [], boCau: null, coTrung: false };
const loc = (q) => (b) => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && '$ne' in v) return b[k] !== v.$ne;
    return b[k] === v || (v === false && !b[k]);
});
jest.mock('../models/NguPhapBaoSai', () => {
    const tim = (q) => mockDb.bao.filter(loc(q));
    return {
        find: (q) => {
            const chuoi = { lean: async () => tim(q).map((b) => ({ ...b, userId: { email: 'a@b.c' } })) };
            chuoi.sort = () => chuoi; chuoi.skip = () => chuoi; chuoi.limit = () => chuoi; chuoi.populate = () => chuoi;
            return chuoi;
        },
        countDocuments: async (q) => tim(q).length,
        findById: (id) => ({ lean: async () => mockDb.bao.find((b) => b._id === id) || null }),
        updateMany: jest.fn(async (q, u) => { tim(q).forEach((b) => Object.assign(b, u.$set)); return {}; }),
    };
});
jest.mock('../models/NguPhapBaiTap', () => ({
    updateOne: jest.fn(async (q, u) => { mockDb.boCau = u; return {}; }),
}));
jest.mock('../models/NguPhapMuc', () => ({
    exists: async () => mockDb.coTrung,
    updateOne: jest.fn(async () => ({})),
    find: () => {
        const chuoi = { lean: async () => mockDb.muc };
        chuoi.select = () => chuoi; chuoi.sort = () => chuoi; chuoi.skip = () => chuoi; chuoi.limit = () => chuoi;
        return chuoi;
    },
    countDocuments: async () => mockDb.muc.length,
}));
jest.mock('../models/BuoiNguPhap', () => ({}));

const NguPhapMuc = require('../models/NguPhapMuc');
const NguPhapBaoSai = require('../models/NguPhapBaoSai');
const Q = require('../services/nguPhapQuanTri');

const baoCau = (o) => ({ loai: 'cau', mucId: 'bi-dong', so: 2, daKhoiPhuc: false, banSao: { loai: 'sua', sai: 'A', dung: 'B' }, createdAt: new Date(), ...o });

beforeEach(() => {
    mockDb.bao = [baoCau({ _id: 'r1' }), baoCau({ _id: 'r2', userId: 'u2' })];
    mockDb.muc = [];
    mockDb.boCau = null;
    mockDb.coTrung = false;
    NguPhapMuc.updateOne.mockClear();
    NguPhapBaoSai.updateMany.mockClear();
});

describe('danh sách báo cáo', () => {
    test('có tên công thức, tóm tắt nội dung, người báo, thống kê theo trạng thái', async () => {
        const r = await Q.danhSachBaoCao({});
        expect(r.baoCao[0]).toMatchObject({ id: 'r1', congThuc: 'Câu bị động', noiDung: 'Sửa: A => B', nguoiBao: 'a@b.c' });
        expect(r.thongKe).toEqual({ 'cho-xu-ly': 2, 'da-xac-nhan': 0, 'da-khoi-phuc': 0 });
    });
    test('trạng thái lạ thì về "chờ xử lý"', async () => {
        expect((await Q.danhSachBaoCao({ trangThai: '<script>' })).baoCao).toHaveLength(2);
    });
});

describe('xử lý', () => {
    test('khôi phục câu: bỏ dấu ẩn, khép mọi báo cáo về cùng câu đó', async () => {
        expect(await Q.khoiPhuc('r1')).toMatchObject({ ok: true });
        expect(mockDb.boCau).toEqual({ $unset: { 'cau.2.an': '' } });
        expect(mockDb.bao.every((b) => b.daKhoiPhuc)).toBe(true);
    });
    test('khôi phục hai lần: 409', async () => {
        await Q.khoiPhuc('r1');
        expect((await Q.khoiPhuc('r1')).ma).toBe(409);
    });
    test('khôi phục mục khi đã có mục mới cùng tên: từ chối, không đè', async () => {
        mockDb.bao = [{ _id: 'm1', loai: 'muc', mucId: 'x', so: -1, banSao: { khoa: 'hoi:a', tenChuan: 'a', noiDung: { ten: 'A' } } }];
        mockDb.coTrung = true;
        expect((await Q.khoiPhuc('m1')).ma).toBe(409);
        expect(NguPhapMuc.updateOne).not.toHaveBeenCalled();
    });
    test('xác nhận sai: giữ ẩn, cả hai báo cáo cùng câu rời khỏi "chờ xử lý"', async () => {
        await Q.xacNhanSai('r1');
        expect(mockDb.boCau).toBeNull();
        expect((await Q.danhSachBaoCao({})).baoCao).toHaveLength(0);
        expect((await Q.danhSachBaoCao({ trangThai: 'da-xac-nhan' })).baoCao).toHaveLength(2);
    });
    test('báo cáo không có: 404', async () => {
        expect((await Q.khoiPhuc('khong-co')).ma).toBe(404);
        expect((await Q.xacNhanSai('khong-co')).ma).toBe(404);
    });
});

describe('thư viện', () => {
    test('liệt kê mục AI kèm câu tra ban đầu và số ví dụ', async () => {
        mockDb.muc = [{ _id: 'abc', khoa: 'hoi:dao ngu', noiDung: { ten: 'Đảo ngữ', congThuc: [1, 2], vd: [1] }, viDuThem: [1, 2] }];
        const r = await Q.danhSachThuVien({});
        expect(r.muc[0]).toMatchObject({ ten: 'Đảo ngữ', cauTra: 'dao ngu', soCongThuc: 2, soViDu: 3 });
    });
});

describe('an toàn', () => {
    const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminNguPhap.js'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'js', 'features', 'vocab', 'ngu-phap-ai-admin.js'), 'utf8');

    test('mọi API quản trị chỉ cho admin', () => {
        expect(route).toMatch(/router\.use\(protect, authorize\('admin'\)\);/);
        expect(server).toMatch(/app\.use\('\/api\/admin\/ngu-phap', require\('\.\/routes\/adminNguPhap'\)\)/);
    });
    test('trang admin escape mọi chuỗi từ AI hoặc người dùng trước khi vào HTML', () => {
        // Mọi `${...}` trong template phải là esc(...), Number(...), một điều kiện, hoặc một biến số trang.
        const noiSuy = [...js.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1].trim());
        const khongAnToan = noiSuy.filter((x) => !/^(esc\(|Number\(|API_URL|getToken\(\)|b\.loai === |b\.daKhoiPhuc|b\.daXuLy|trang|soTrang|url|encodeURIComponent\(|hanhDong|\s*$)/.test(x));
        expect(khongAnToan).toEqual([]);
        for (const truong of ['b.congThuc', 'b.noiDung', 'b.nguoiBao', 'm.ten', 'm.cauTra']) {
            expect(js).toContain(`esc(${truong})`);
        }
    });
    test('script dòng lệnh dùng chung logic khôi phục với trang admin', () => {
        const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'xemBaoSai.js'), 'utf8');
        expect(script).toMatch(/require\('\.\.\/services\/nguPhapQuanTri'\)/);
    });
});
