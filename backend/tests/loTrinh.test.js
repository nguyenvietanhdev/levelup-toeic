/**
 * Lộ trình hôm nay: các bước và bước nào đã xong, tính từ dữ liệu đã có.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. "Hôm nay" theo giờ UTC → học lúc 6h sáng giờ Việt Nam bị tính sang hôm qua.
 *   2. Không có từ nào đến hạn mà bước Ôn sai vẫn "chưa xong" → không bao giờ đủ 6/6.
 *   3. Đếm phiên hội thoại / nghe CHƯA chấm là đã xong.
 */
const mockCount = {};
const goi = [];
const mo = (ten) => ({
    countDocuments: async (q) => { goi.push([ten, q]); return mockCount[ten] ?? 0; },
});
jest.mock('../models/PracticeSession', () => ({
    countDocuments: async (q) => {
        goi.push(['PracticeSession', q]);
        return q.mode === 'review-mistakes' ? (mockCount.onSai ?? 0) : (mockCount.hocTu ?? 0);
    },
}));
jest.mock('../models/Conversation', () => mo('Conversation'));
jest.mock('../models/BuoiPhanXa', () => mo('BuoiPhanXa'));
let mockHoSo = null;
jest.mock('../models/HoSoHocVien', () => ({
    findOne: () => ({ select: () => ({ lean: async () => mockHoSo }) }),
}));
jest.mock('../services/nhamDiemYeu', () => ({ layNham: async () => [{ key: 'tense' }] }));
const mockToeic = { hs: null, dem: 0 };
jest.mock('../models/ToeicAttempt', () => ({ countDocuments: async () => mockToeic.dem }));
jest.mock('../services/hoSoToeic', () => ({ layHoSoToeic: async () => mockToeic.hs }));
const mockBang = { hs: null };
jest.mock('../services/hoSoBang', () => ({
    layHoSoBang: async () => mockBang.hs,
    CAU_HINH: { ielts: { lang: 'en', rubric: 'ielts', ten: 'IELTS' }, hsk: { lang: 'zh', rubric: 'hsk', ten: 'HSK' } },
}));
jest.mock('../models/ListeningSession', () => mo('ListeningSession'));
jest.mock('../models/ReadingAttempt', () => mo('ReadingAttempt'));
jest.mock('../models/Essay', () => mo('Essay'));
jest.mock('../models/Translation', () => mo('Translation'));
jest.mock('../models/WrongWord', () => ({ ...mo('WrongWord'), langFilter: () => ({}) }));
jest.mock('../models/LoiOn', () => mo('LoiOn'));
jest.mock('../models/BuoiOnLoi', () => mo('BuoiOnLoi'));
let mockKeHoach = null;
jest.mock('../models/TongKetTuan', () => ({
    findOne: (q) => { goi.push(['TongKetTuan', q]); return { select: () => ({ lean: async () => mockKeHoach }) }; },
}));
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { vocabLang: 'en' } }) }) }),
}));

const { layLoTrinh, dungLoTrinh, homNayVN, vietHayDich, dauTuanVN } = require('../services/loTrinh');

beforeEach(() => {
    goi.length = 0;
    for (const k of Object.keys(mockCount)) delete mockCount[k];
});

describe('"hôm nay" theo giờ Việt Nam', () => {
    test('6h sáng giờ VN (23h UTC hôm trước) vẫn là hôm nay', () => {
        const r = homNayVN(new Date('2026-10-24T23:00:00Z'));
        expect(r.ngay).toBe('2026-10-25');
        expect(r.dau.toISOString()).toBe('2026-10-24T17:00:00.000Z');
    });

    test('23h59 giờ VN chưa sang ngày mới', () => {
        expect(homNayVN(new Date('2026-10-25T16:59:00Z')).ngay).toBe('2026-10-25');
        expect(homNayVN(new Date('2026-10-25T17:00:00Z')).ngay).toBe('2026-10-26');
    });

    test('Viết và Dịch đổi xen kẽ theo ngày', () => {
        const a = homNayVN(new Date('2026-10-25T05:00:00Z')).soNgay;
        expect(vietHayDich(a)).not.toBe(vietHayDich(a + 1));
    });
});

describe('dựng lộ trình', () => {
    const DEM = { onSai: 0, hocTu: 0, nghe: 0, doc: 0, noi: 0, viet: 0, dich: 0, tuDenHan: 5 };

    test('sáu bước theo đúng thứ tự tiếp nhận → tạo ra', () => {
        const r = dungLoTrinh(DEM, { ngay: 'x', soNgay: 1 });
        expect(r.buoc.map((b) => b.key)).toEqual(['on-sai', 'hoc-tu', 'nghe', 'doc', 'noi', 'viet-dich']);
        expect(r).toMatchObject({ soXong: 0, tong: 6 });
    });

    test('không có từ đến hạn → Ôn sai tính là xong (bỏ qua)', () => {
        const r = dungLoTrinh({ ...DEM, tuDenHan: 0 }, { ngay: 'x', soNgay: 1 });
        expect(r.buoc[0]).toMatchObject({ xong: true, boQua: true });
    });

    test('Viết HOẶC Dịch đều tính cho bước 6; gợi ý theo ngày', () => {
        const r = dungLoTrinh({ ...DEM, dich: 1 }, { ngay: 'x', soNgay: 2 });
        expect(r.buoc[5]).toMatchObject({ xong: true, soLan: 1, goiY: 'viet' });
    });
});

describe('đếm từ dữ liệu đã có', () => {
    test('chỉ tính phiên ĐÃ CHẤM (hội thoại, nghe) và từ mốc 00:00 giờ VN', async () => {
        mockCount.Conversation = 1;
        mockCount.hocTu = 2;
        const r = await layLoTrinh('u1', new Date('2026-10-25T03:00:00Z'));
        expect(r.buoc.find((b) => b.key === 'noi')).toMatchObject({ xong: true, soLan: 1 });
        expect(r.buoc.find((b) => b.key === 'hoc-tu').soLan).toBe(2);

        const conv = goi.find(([t]) => t === 'Conversation')[1];
        expect(conv).toMatchObject({ userId: 'u1', status: 'done' });
        expect(conv.updatedAt.$gte.toISOString()).toBe('2026-10-24T17:00:00.000Z');
        expect(goi.find(([t]) => t === 'ListeningSession')[1]).toMatchObject({ status: 'done' });
        // Ôn sai và Học từ tách nhau theo mode.
        const ps = goi.filter(([t]) => t === 'PracticeSession').map(([, q]) => q.mode);
        expect(ps).toEqual(['review-mistakes', { $ne: 'review-mistakes' }]);
    });

    test('route đăng ký sau đăng nhập', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        expect(readFileSync(join(__dirname, '..', 'server.js'), 'utf8'))
            .toMatch(/app\.use\('\/api\/lo-trinh', require\('\.\/routes\/loTrinh'\)\)/);
        expect(readFileSync(join(__dirname, '..', 'routes', 'loTrinh.js'), 'utf8')).toMatch(/router\.use\(protect\)/);
    });
});

describe('kế hoạch tuần từ Tổng kết tuần', () => {
    test('tuần bắt đầu thứ Hai giờ VN', () => {
        expect(dauTuanVN(new Date('2026-10-25T05:00:00Z'))).toBe('2026-10-19'); // CN 25/10 → T2 19/10
        expect(dauTuanVN(new Date('2026-10-25T17:30:00Z'))).toBe('2026-10-26'); // 00:30 T2 26/10 VN
    });

    test('có tổng kết tuần này → trả keHoachTuan; chưa có → []', async () => {
        mockKeHoach = { keHoach: [{ viec: 'Nghe 3 bài', buoc: 'nghe' }] };
        const r = await layLoTrinh('u1', new Date('2026-10-25T05:00:00Z'));
        expect(r.keHoachTuan).toEqual([{ viec: 'Nghe 3 bài', buoc: 'nghe' }]);
        expect(goi.find(([t]) => t === 'TongKetTuan')[1]).toMatchObject({ tuan: '2026-10-19', lang: 'en' });
        mockKeHoach = null;
        expect((await layLoTrinh('u1')).keHoachTuan).toEqual([]);
    });
});

describe('bước Ôn sai gộp ôn từ và ôn lỗi', () => {
    const D = { onSai: 0, hocTu: 0, nghe: 0, doc: 0, noi: 0, viet: 0, dich: 0, tuDenHan: 0 };
    test('chỉ có LỖI đến hạn → chưa xong, không bỏ qua; ôn lỗi một buổi → xong', () => {
        const a = dungLoTrinh({ ...D, loiDenHan: 3 }, { ngay: 'x', soNgay: 1 }).buoc[0];
        expect(a).toMatchObject({ xong: false, boQua: false, loiDenHan: 3 });
        const b = dungLoTrinh({ ...D, loiDenHan: 3, onLoi: 1 }, { ngay: 'x', soNgay: 1 }).buoc[0];
        expect(b).toMatchObject({ xong: true, soLan: 1 });
    });

    test('đọc từ DB: đếm lỗi đến hạn và buổi ôn lỗi đã trả lời hôm nay', async () => {
        mockCount.LoiOn = 2;
        mockCount.BuoiOnLoi = 1;
        const r = await layLoTrinh('u1', new Date('2026-10-25T05:00:00Z'));
        expect(r.buoc[0]).toMatchObject({ loiDenHan: 2, soLan: 1, xong: true });
        expect(goi.find(([t]) => t === 'BuoiOnLoi')[1]).toMatchObject({ 'cau.daTra': true });
    });
});

describe('lộ trình theo hồ sơ', () => {
    const { dungLoTrinhHoSo, thuTuGiaoTiep, layLoTrinh } = require('../services/loTrinh');
    const KHUNG = ['khung-cau', 'qua-khu', 'tell-say-talk', 'mau-giao-tiep'];
    const tt = (khung, noi, nghe) => [
        ...KHUNG.map((key) => ({ key, ten: key, diem: khung, duDuLieu: true })),
        { key: 'noi', diem: noi, duDuLieu: true },
        { key: 'nghe', diem: nghe, duDuLieu: true },
    ];
    const D = { onSai: 0, hocTu: 0, nghe: 0, doc: 0, noi: 0, viet: 0, dich: 0, tuDenHan: 0, phanXa: 0 };

    test('chưa vững: dựng phản xạ trước hội thoại', () => {
        expect(thuTuGiaoTiep(tt(40, 40, 80))).toEqual(['on-sai', 'phan-xa', 'noi', 'nghe', 'hoc-tu']);
    });
    test('nghe yếu: nghe trước khi hội thoại', () => {
        expect(thuTuGiaoTiep(tt(40, 40, 30))).toEqual(['on-sai', 'nghe', 'phan-xa', 'noi', 'hoc-tu']);
    });
    test('khung câu và nói đều vững: hội thoại thật lên trước', () => {
        expect(thuTuGiaoTiep(tt(90, 90, 90))).toEqual(['on-sai', 'noi', 'phan-xa', 'nghe', 'hoc-tu']);
    });
    test('thiếu dữ liệu một khung thì chưa coi là vững', () => {
        const t = tt(90, 90, 90);
        t[0].duDuLieu = false;
        expect(thuTuGiaoTiep(t)[1]).toBe('phan-xa');
    });
    test('xong vẫn đếm từ việc đã làm, kèm lý do và khung trọng tâm', () => {
        const r = dungLoTrinhHoSo({ ...D, phanXa: 1 }, tt(40, 40, 80), { khung: 'qua-khu', ten: 'Quá khứ', diem: 38, cungLapLai: true }, { ngay: 'x', soNgay: 1 });
        const b = r.buoc.find((x) => x.key === 'phan-xa');
        expect(b).toMatchObject({ xong: true, khung: 'qua-khu' });
        expect(b.lyDo).toContain('38/100');
        expect(b.lyDo).toContain('hay sai');
        expect(r.tong).toBe(5);
    });
    test('chưa làm test: giữ 6 bước cũ và mời lập hồ sơ; có hồ sơ: theo hồ sơ', async () => {
        mockHoSo = null;
        const cu = await layLoTrinh('u1');
        expect(cu.tong).toBe(6);
        expect(cu.moiLapHoSo).toBe(true);
        mockHoSo = { mucTieu: 'giao-tiep', testNgay: new Date(), kyNang: {} };
        const moi = await layLoTrinh('u1');
        expect(moi.tong).toBe(5);
        expect(moi.buoc.map((b) => b.key)).toContain('phan-xa');
        expect(moi.mucTieu).toBe('giao-tiep');
        mockHoSo = null;
    });
});

describe('lộ trình mục tiêu TOEIC', () => {
    const { dungLoTrinhToeic, layLoTrinh } = require('../services/loTrinh');
    const D = { onSai: 0, hocTu: 0, nghe: 0, doc: 0, noi: 0, viet: 0, dich: 0, tuDenHan: 0 };
    const hs = (o = {}) => ({
        diemMucTieu: 750, kyYeu: null, trongTam: { part: 7, ten: 'Đọc hiểu', canNguPhap: false, lyDo: 'mất nhiều' }, ...o,
    });
    const keys = (r) => r.buoc.map((b) => b.key);

    test('thứ tự: ôn, Part trọng tâm, học từ, kỹ năng, đề đầy đủ', () => {
        expect(keys(dungLoTrinhToeic(D, hs(), { ngay: 'x', soNgay: 1 })))
            .toEqual(['on-sai', 'toeic-part', 'hoc-tu', 'nghe', 'toeic-full']);
    });
    test('kỹ năng theo chỗ đang yếu hơn', () => {
        expect(keys(dungLoTrinhToeic(D, hs({ kyYeu: 'doc' }), { ngay: 'x', soNgay: 1 }))[3]).toBe('doc');
        expect(keys(dungLoTrinhToeic(D, hs({ kyYeu: 'nghe' }), { ngay: 'x', soNgay: 1 }))[3]).toBe('nghe');
    });
    test('xong đếm từ bài đã làm; bước Part mang đúng số Part và lý do', () => {
        const r = dungLoTrinhToeic({ ...D, toeicPart: 1 }, hs(), { ngay: 'x', soNgay: 1 });
        expect(r.buoc[1]).toMatchObject({ xong: true, part: 7, lyDo: 'mất nhiều' });
        expect(r.buoc[4].xong).toBe(false);
    });
    test('đang theo mục tiêu TOEIC: API trả lộ trình TOEIC, không mời làm test giao tiếp', async () => {
        mockHoSo = { mucTieu: 'toeic', kyNang: {} };
        mockToeic.hs = hs();
        mockToeic.dem = 1;
        const r = await layLoTrinh('u1');
        mockHoSo = null;
        expect(r).toMatchObject({ mucTieu: 'toeic', diemMucTieu: 750, tong: 5 });
        expect(r.moiLapHoSo).toBeUndefined();
        expect(keys(r)).toContain('toeic-part');
    });
});

describe('lộ trình mục tiêu IELTS / HSK', () => {
    const { dungLoTrinhBang, layLoTrinh } = require('../services/loTrinh');
    const D = { onSai: 0, hocTu: 0, nghe: 0, doc: 0, noi: 0, viet: 0, dich: 0, tuDenHan: 0 };
    const k = (key, buoc, duDuLieu = true, diem = 6, donVi = '/9') => ({ key, ten: key, buoc, duDuLieu, diem, donVi });
    const hs = (tt) => ({
        rubric: 'ielts', ten: 'IELTS', diemMucTieu: 7,
        kyNang: [k('viet', 'bang-viet'), k('noi', 'bang-noi'), k('doc', 'doc', true, 80, '%'), k('nghe', 'nghe', true, 40, '%')],
        trongTam: tt,
    });
    const keys = (r) => r.buoc.map((b) => b.key);

    test('kỹ năng cần nhất lên ngay sau phần ôn, học từ cuối cùng', () => {
        expect(keys(dungLoTrinhBang(D, hs({ buoc: 'nghe', lyDo: 'Nghe thấp nhất' }), { ngay: 'x', soNgay: 1 })))
            .toEqual(['on-sai', 'nghe', 'bang-viet', 'bang-noi', 'doc', 'hoc-tu']);
    });
    test('Viết, Nói mang kiểu chấm để mở đúng; xong đếm bài chấm theo mục tiêu hôm nay', () => {
        const r = dungLoTrinhBang({ ...D, bangViet: 1 }, hs({ buoc: 'bang-noi', lyDo: 'Chưa đủ bài' }), { ngay: 'x', soNgay: 1 });
        expect(r.buoc[1]).toMatchObject({ key: 'bang-noi', rubric: 'ielts', xong: false, lyDo: 'Chưa đủ bài' });
        expect(r.buoc.find((b) => b.key === 'bang-viet')).toMatchObject({ xong: true, lyDo: 'viet: 6/9.' });
    });
    test('HSK đã test tiếng Trung: thêm Phản xạ câu nhắm khung yếu nhất, ngay sau kỹ năng cần nhất', () => {
        const h = {
            ...hs({ buoc: 'nghe', lyDo: 'Nghe thấp nhất' }),
            nenTang: { testNgay: new Date(), trongTam: { khung: 'zh-luong-tu', ten: 'Lượng từ & số đếm', diem: 32 } },
        };
        const r = dungLoTrinhBang({ ...D, phanXa: 0 }, h, { ngay: 'x', soNgay: 1 });
        expect(keys(r)).toEqual(['on-sai', 'nghe', 'phan-xa', 'bang-viet', 'bang-noi', 'doc', 'hoc-tu']);
        expect(r.buoc[2]).toMatchObject({ khung: 'zh-luong-tu', xong: false, lyDo: 'Nền tảng câu: Lượng từ & số đếm (32/100).' });
    });
    test('HSK chưa test tiếng Trung: không thêm Phản xạ câu', () => {
        const h = { ...hs({ buoc: 'nghe', lyDo: 'x' }), nenTang: { testNgay: null, trongTam: { khung: 'zh-tt' } } };
        expect(keys(dungLoTrinhBang(D, h, { ngay: 'x', soNgay: 1 }))).not.toContain('phan-xa');
    });
    test('API: theo IELTS khi học tiếng Anh; HSK mà đang học tiếng Anh thì không dùng lộ trình HSK', async () => {
        mockBang.hs = hs({ buoc: 'bang-viet', lyDo: 'x' });
        mockHoSo = { mucTieu: 'ielts', kyNang: {}, chiTiet: { ielts: 7 } };
        const r = await layLoTrinh('u1');
        expect(r).toMatchObject({ mucTieu: 'ielts', diemMucTieu: 7, tong: 6 });
        mockHoSo = { mucTieu: 'hsk', kyNang: {}, chiTiet: { hsk: 3 } };
        expect((await layLoTrinh('u1')).mucTieu).toBeUndefined();
        mockHoSo = null;
    });
});
