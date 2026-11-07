/**
 * Mục tiêu IELTS và HSK.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Band IELTS lấy cả bài chấm kiểu khác → sai đơn vị.
 *   2. Quy % bài luyện ra band hay cấp HSK → bịa số.
 *   3. Một bài đã kết luận về cả kỹ năng.
 *   4. Chọn mục tiêu không khớp ngôn ngữ đang học (HSK khi học tiếng Anh).
 *   5. Điểm mục tiêu sai thang được lưu.
 */
const mockDb = { essay: [], convo: [], doc: [], nghe: [], q: {} };
const mo = (ten) => ({
    find: jest.fn((q) => {
        mockDb.q[ten] = q;
        const chuoi = { lean: async () => mockDb[ten] };
        chuoi.sort = () => chuoi; chuoi.limit = () => chuoi; chuoi.select = () => chuoi;
        return chuoi;
    }),
});
jest.mock('../models/Essay', () => mo('essay'));
jest.mock('../models/Conversation', () => mo('convo'));
jest.mock('../models/ReadingAttempt', () => mo('doc'));
jest.mock('../models/ListeningSession', () => mo('nghe'));
const mockLang = { v: 'en' };
const mockGhi = { hoSo: [], profile: [] };
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { vocabLang: mockLang.v } }) }) }),
    updateOne: jest.fn(async (q, u) => { mockGhi.profile.push(u.$set); return {}; }),
}));
jest.mock('../models/HoSoHocVien', () => ({
    findOne: jest.fn(() => ({ lean: async () => ({ mucTieu: 'ielts', kyNang: {}, chiTiet: { ielts: 7 } }) })),
    updateOne: jest.fn(async (q, u) => { mockGhi.hoSo.push(u.$set); return {}; }),
}));

const B = require('../services/hoSoBang');
const HS = require('../services/hoSoHoc');

beforeEach(() => {
    Object.assign(mockDb, { essay: [], convo: [], doc: [], nghe: [], q: {} });
    mockLang.v = 'en';
    mockGhi.hoSo = [];
    mockGhi.profile = [];
});

describe('tóm tắt 4 kỹ năng', () => {
    test('Viết, Nói làm tròn nửa band; Đọc, Nghe là %; bài mới nặng hơn', () => {
        const r = B.tomTatBang({ viet: [7, 5], noi: [6, 6], doc: [{ dung: 8, tong: 10 }, { dung: 4, tong: 10 }], nghe: [50, 70] });
        const k = Object.fromEntries(r.map((x) => [x.key, x]));
        expect(k.viet).toMatchObject({ diem: 6, donVi: '/9', duDuLieu: true });
        expect(k.noi.diem).toBe(6);
        expect(k.doc.diem).toBeGreaterThan(60);
        expect(k.nghe.diem).toBeLessThan(60);
    });
    test('dưới 2 bài: chưa đủ dữ liệu, không ra điểm', () => {
        const r = B.tomTatBang({ viet: [8] });
        expect(r.find((x) => x.key === 'viet')).toMatchObject({ duDuLieu: false, diem: null, soBai: 1 });
    });
    test('bài đọc không có câu nào không tính', () => {
        expect(B.tomTatBang({ doc: [{ dung: 0, tong: 0 }, { dung: 0, tong: 0 }] }).find((x) => x.key === 'doc').soBai).toBe(0);
    });
});

describe('ước lượng và trọng tâm', () => {
    const k = (o) => B.tomTatBang({ viet: [6, 6], noi: [7, 7], doc: [{ dung: 9, tong: 10 }, { dung: 9, tong: 10 }], nghe: [90, 90], ...o });
    test('band IELTS chỉ từ Viết và Nói; thiếu một trong hai thì không ước lượng', () => {
        expect(B.uocLuongIelts(k())).toBe(6.5);
        expect(B.uocLuongIelts(k({ noi: [7] }))).toBeNull();
    });
    test('chưa đủ dữ liệu thì làm kỹ năng đó trước, Viết và Nói trước Đọc và Nghe', () => {
        expect(B.chonKyNangTrongTam(k({ noi: [], nghe: [] }), 'IELTS')).toMatchObject({ key: 'noi', buoc: 'bang-noi' });
        expect(B.chonKyNangTrongTam(k({ noi: [], nghe: [] }), 'IELTS').lyDo).toContain('tiêu chí IELTS');
    });
    test('đủ hết: chọn kỹ năng thấp nhất trên cùng thang', () => {
        expect(B.chonKyNangTrongTam(k(), 'IELTS').key).toBe('viet'); // 6/9 ≈ 67% thấp hơn 90%
        expect(B.chonKyNangTrongTam(k({ nghe: [40, 40] }), 'IELTS').key).toBe('nghe');
    });
});

describe('đọc từ bài đã làm', () => {
    test('IELTS: bài chấm kiểu IELTS, tiếng Anh, hội thoại đã xong', async () => {
        await B.layHoSoBang('u1', 'ielts', { ielts: 7 });
        expect(mockDb.q.essay.rubric).toEqual({ $in: ['ielts', null, ''] });
        expect(mockDb.q.convo).toMatchObject({ rubric: 'ielts', status: 'done' });
        expect(mockDb.q.nghe).toMatchObject({ status: 'done' });
    });
    test('bản ghi cũ: bài Viết chưa lưu kiểu chấm vẫn tính (lúc đó mặc định là IELTS/HSK); hội thoại cũ thì không', () => {
        expect(B.kieuChamViet('ielts').$in).toEqual(expect.arrayContaining([null, '']));
        expect(B.theoNgonNgu('en')).toEqual({ $in: ['en', null] }); // thiếu lang = tiếng Anh, thời chỉ có tiếng Anh
        expect(B.theoNgonNgu('zh')).toBe('zh');
    });
    test('HSK: tiếng Trung, kiểu chấm HSK, không quy ra cấp', async () => {
        mockDb.essay = [{ overall: 6 }, { overall: 6 }];
        mockDb.convo = [{ feedback: { overall: 6 } }, { feedback: { overall: 6 } }];
        const r = await B.layHoSoBang('u1', 'hsk', { hsk: 4 });
        expect(mockDb.q.essay).toMatchObject({ lang: 'zh', rubric: { $in: ['hsk', null, ''] } });
        expect(r).toMatchObject({ ten: 'HSK', diemMucTieu: 4, uocLuong: null });
    });
    test('mục tiêu lạ: null', async () => {
        expect(await B.layHoSoBang('u1', 'toefl')).toBeNull();
    });
});

describe('đặt mục tiêu', () => {
    test('mở cả 4 mục tiêu', async () => {
        for (const m of ['giao-tiep', 'toeic', 'ielts']) expect(await HS.datMucTieu('u1', m)).toEqual({ ok: true });
        mockLang.v = 'zh';
        expect(await HS.datMucTieu('u1', 'hsk')).toEqual({ ok: true });
    });
    test('ngôn ngữ không khớp: từ chối, nói rõ cần đổi ngôn ngữ nào', async () => {
        const r = await HS.datMucTieu('u1', 'hsk');
        expect(r.ma).toBe(400);
        expect(r.loi).toContain('tiếng Trung');
        mockLang.v = 'zh';
        expect((await HS.datMucTieu('u1', 'ielts')).loi).toContain('tiếng Anh');
        expect(mockGhi.hoSo).toHaveLength(0);
    });
    test('học cả hai ngôn ngữ thì chọn được mọi mục tiêu', async () => {
        mockLang.v = 'bi';
        expect(await HS.datMucTieu('u1', 'hsk')).toEqual({ ok: true });
        expect(await HS.datMucTieu('u1', 'ielts')).toEqual({ ok: true });
    });
    test.each([
        ['ielts', 7.5, true], ['ielts', 7.3, false], ['ielts', 10, false], ['ielts', 3.5, false],
        ['hsk', 4, true], ['hsk', 4.5, false], ['hsk', 7, false],
    ])('%s mục tiêu %s: lưu = %s', async (muc, diem, luu) => {
        mockLang.v = 'bi';
        await HS.datMucTieu('u1', muc, { diemMucTieu: diem });
        const coLuu = mockGhi.hoSo.some((s) => Object.keys(s).includes(`chiTiet.${muc}`));
        expect(coLuu).toBe(luu);
    });
    test('mục tiêu chưa có: từ chối', async () => {
        expect((await HS.datMucTieu('u1', 'toefl')).ma).toBe(400);
    });
});
