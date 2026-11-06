/**
 * Hồ sơ người học và test đầu vào.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Đáp án trắc nghiệm lộ cho client (đúng luôn ở vị trí đầu, hoặc gửi kèm đáp án).
 *   2. Ít dữ liệu mà vẫn kết luận trình độ.
 *   3. Câu nói chuyển sang gõ, hoặc AI lỗi, vẫn bị tính vào kỹ năng Nói.
 *   4. Một câu chấm hai lần → tốn AI, ghi hồ sơ sai.
 *   5. Sửa kho làm id câu trong test không còn tồn tại → test đứt giữa chừng.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const mockBuoi = {};
const mockHoSo = {};
jest.mock('../models/BuoiKiemTra', () => ({
    countDocuments: jest.fn(async () => mockBuoi.daMo || 0),
    create: jest.fn(async (d) => { mockBuoi.doc = { _id: 'b1', i: 0, daLam: [], ...d }; return mockBuoi.doc; }),
    findOne: jest.fn(() => ({ lean: async () => mockBuoi.doc && JSON.parse(JSON.stringify(mockBuoi.doc)) })),
    updateOne: jest.fn(async (q, u) => {
        if (u.$inc) {
            if (mockBuoi.doc.i !== q.i) return { modifiedCount: 0 };
            mockBuoi.doc.i += 1;
            return { modifiedCount: 1 };
        }
        Object.assign(mockBuoi.doc, u.$set);
        return { modifiedCount: 1 };
    }),
}));
jest.mock('../models/HoSoHocVien', () => ({
    findOne: jest.fn(() => {
        const lean = async () => mockHoSo.doc || null;
        return { lean, select: () => ({ lean }) };
    }),
    updateOne: jest.fn(async (q, u) => {
        mockHoSo.doc = mockHoSo.doc || { kyNang: {} };
        for (const [k, v] of Object.entries(u.$set || {})) {
            if (k.startsWith('kyNang.')) mockHoSo.doc.kyNang[k.slice(7)] = v;
            else mockHoSo.doc[k] = v;
        }
        return { modifiedCount: 1 };
    }),
}));
let mockLang = 'en';
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { vocabLang: mockLang } }) }) }),
}));
jest.mock('../models/PhanXaTienDo', () => ({}));
jest.mock('../models/BuoiPhanXa', () => ({}));

const HS = require('../services/hoSoHoc');
const T = require('../services/kiemTraDauVao');
const { THEO_ID } = require('../services/phanXaKho');

const NOW = new Date('2026-11-06T05:00:00Z');
const dau = (a) => a[0];

beforeEach(() => {
    mockBuoi.doc = null;
    mockBuoi.daMo = 0;
    mockHoSo.doc = null;
    mockLang = 'en';
    chatCompletion.mockReset();
});

describe('điểm kỹ năng', () => {
    const lap = (kq) => kq.reduce((k, d) => HS.capNhatKyNang(k, d, NOW), null);
    test('một câu may rủi không đẩy điểm ra hai đầu; đúng/sai nhiều mới rõ', () => {
        expect(HS.diemCua(lap([true]))).toBeLessThan(75);
        expect(HS.diemCua(lap([false]))).toBeGreaterThan(25);
        expect(HS.diemCua(lap(Array(8).fill(true)))).toBeGreaterThanOrEqual(HS.NGUONG_VUNG);
        expect(HS.diemCua(lap(Array(8).fill(false)))).toBeLessThan(HS.NGUONG_YEU);
    });
    test('câu gần đây nặng hơn câu cũ: sai rồi tiến bộ khác đúng rồi sa sút', () => {
        const tienBo = HS.diemCua(lap([false, false, false, true, true, true]));
        const saSut = HS.diemCua(lap([true, true, true, false, false, false]));
        expect(tienBo).toBeGreaterThan(saSut);
    });
    test('dưới 3 lần: báo chưa đủ dữ liệu, trình độ chung không kết luận', () => {
        const t = HS.tomTatKyNang({ noi: lap([false, false]) });
        expect(t.find((k) => k.key === 'noi')).toMatchObject({ duDuLieu: false, muc: 'chua-du' });
        expect(HS.tongQuanTrinhDo(t)).toEqual({ diem: 0, nhan: 'Chưa đủ dữ liệu' });
    });
});

describe('trọng tâm', () => {
    const tt = (diem) => Object.entries(diem).map(([key, d]) => ({ key, ten: key, diem: d }));
    test('chọn khung điểm thấp nhất, không chọn Nghe/Nói', () => {
        const r = HS.chonTrongTam(tt({ 'qua-khu': 60, 'khung-cau': 40, nghe: 5, noi: 5 }));
        expect(r.khung).toBe('khung-cau');
    });
    test('lỗi lặp trong bài làm được ưu tiên thêm và được ghi nhận', () => {
        const r = HS.chonTrongTam(tt({ 'qua-khu': 50, 'khung-cau': 40 }), ['tense']);
        expect(r).toMatchObject({ khung: 'qua-khu', cungLapLai: true });
    });
});

describe('kho câu test', () => {
    test('mọi id câu tự tạo đều có trong kho Phản xạ', () => {
        for (const m of Object.values(T.CAU_THEO_MUC)) {
            for (const id of [...m[1], ...m[2]]) expect(THEO_ID.has(id)).toBe(true);
        }
    });
    test('trắc nghiệm đủ 4 lựa chọn khác nhau; id không trùng', () => {
        const ds = [...Object.values(T.TRAC_NGHIEM).flatMap((m) => [...m[1], ...m[2]]), ...T.NGHE[1], ...T.NGHE[2]];
        expect(new Set(ds.map((x) => x.id)).size).toBe(ds.length);
        for (const x of ds) expect(new Set(x.lua).size).toBe(4);
    });
    test('trong mọi kết quả, 15 câu đều chọn được và không lặp', () => {
        for (const dung of [true, false]) {
            const daLam = [];
            T.KE_HOACH.forEach((_, i) => {
                const q = T.chonCauTest(i, daLam, true, dau);
                expect(daLam.map((c) => c.id)).not.toContain(q.id);
                daLam.push({ ...q, dung, khongChac: false });
            });
            expect(daLam).toHaveLength(15);
        }
    });
});

describe('độ khó và chẩn đoán', () => {
    test('đúng → câu sau khó hơn; sai → câu dễ; AI không chấm được → giữ mức', () => {
        const c = (o) => [{ kyNang: 'qua-khu', muc: 1, ...o }];
        expect(T.mucTiep([], 'qua-khu')).toBe(1);
        expect(T.mucTiep(c({ dung: true }), 'qua-khu')).toBe(2);
        expect(T.mucTiep(c({ dung: false, muc: 2 }), 'qua-khu')).toBe(1);
        expect(T.mucTiep(c({ khongChac: true, muc: 2 }), 'qua-khu')).toBe(2);
    });
    test('không có micro: câu nói đổi thành câu gõ', () => {
        const i = T.KE_HOACH.findIndex((k) => k.loai === 'noi');
        expect(T.chonCauTest(i, [], false, dau).loai).toBe('go');
    });
    test.each([
        [{ tracNghiem: true, go: true, noi: true }, 'vung'],
        [{ tracNghiem: true, go: true, noi: false }, 'chua-noi-kip'],
        [{ tracNghiem: true, go: false, noi: false }, 'chua-tu-dung'],
        [{ tracNghiem: false, go: false, noi: false }, 'chua-nam'],
        [{ tracNghiem: false, go: true, noi: true }, 'chua-chac'],
        [{ tracNghiem: true, go: false, noi: true }, 'cau-ngan-duoc'],
        [{ tracNghiem: false, go: false, noi: true }, 'bat-dau-duoc'],
        [{ tracNghiem: true, go: false, goThay: true }, 'cau-ngan-duoc'],
        [{ tracNghiem: false, go: false, goThay: false }, 'chua-nam'],
        [{ tracNghiem: true, go: true, goThay: true }, 'vung'],
    ])('nguyên nhân %j → %s', (kq, ma) => {
        expect(T.chanDoanKhung(kq)).toBe(ma);
    });
});

describe('một lượt test', () => {
    test('câu gửi client không có đáp án; đáp án không cố định ở vị trí đầu', async () => {
        const dauTien = new Set();
        for (let n = 0; n < 40; n += 1) {
            const q = { id: 'gt-t1', kyNang: 'mau-giao-tiep', loai: 'trac-nghiem', muc: 1 };
            const c = T.congKhai(q, 0);
            expect(c).not.toHaveProperty('id');
            expect(c).not.toHaveProperty('dapAn');
            dauTien.add(c.lua[0]);
        }
        expect(dauTien.size).toBeGreaterThan(1);
        const go = T.congKhai({ id: 'qk1', kyNang: 'qua-khu', loai: 'go', muc: 1 }, 1);
        expect(JSON.stringify(go)).not.toContain('bank');
    });

    test('giới hạn số lượt mỗi ngày; học tiếng Trung thì chưa mở', async () => {
        mockBuoi.daMo = T.TOI_DA_MOI_NGAY;
        expect((await T.moTest('u1', {}, NOW)).ma).toBe(429);
        mockBuoi.daMo = 0;
        mockLang = 'zh';
        expect((await T.moTest('u1', {}, NOW)).ma).toBe(400);
    });

    test('trả lời lại cùng câu → 409, không tốn thêm AI', async () => {
        await T.moTest('u1', {}, NOW);
        mockBuoi.doc.cauHienTai = { id: 'qk1', kyNang: 'qua-khu', loai: 'go', muc: 1 };
        chatCompletion.mockResolvedValue({ success: true, content: '{"ok":false,"note":""}' });
        await T.traLoiTest('u1', 'b1', { i: 0, traLoi: 'abc' }, NOW);
        expect((await T.traLoiTest('u1', 'b1', { i: 0, traLoi: 'abc' }, NOW)).ma).toBe(409);
        expect(chatCompletion).toHaveBeenCalledTimes(1);
    });

    test('hết 15 câu: ghi hồ sơ, có chẩn đoán; chỉ câu thật sự NÓI mới tính kỹ năng Nói', async () => {
        const { cau } = await T.moTest('u1', {}, NOW);
        let c = cau;
        let kq;
        for (let i = 0; i < 15; i += 1) {
            const q = mockBuoi.doc.cauHienTai;
            const body = { i };
            if (q.loai === 'go' || q.loai === 'noi') {
                body.traLoi = THEO_ID.get(q.id).en;
                // Bốn câu nói: hai câu nói thật, hai câu chuyển sang gõ.
                if (q.loai === 'noi' && ['mau-giao-tiep', 'khung-cau'].includes(q.kyNang)) body.cach = 'noi';
            } else {
                body.chon = c.lua[0];
            }
            kq = await T.traLoiTest('u1', 'b1', body, NOW);
            c = kq.cau;
        }
        expect(kq.xong).toBe(true);
        expect(mockHoSo.doc.kyNang.noi.soLan).toBe(2);
        expect(mockHoSo.doc.chanDoan).toHaveLength(5);
        expect(mockHoSo.doc.mucTieu).toBe('giao-tiep');
        expect(chatCompletion).not.toHaveBeenCalled();
    });

    test('câu thứ ba được tính, dù gõ thay hay không có micro', () => {
        const ba = (loai) => T.chanDoan([
            { kyNang: 'qua-khu', loai: 'trac-nghiem', dung: false },
            { kyNang: 'qua-khu', loai: 'go', dung: false },
            { kyNang: 'qua-khu', loai, dung: true },
        ]).find((x) => x.kyNang === 'qua-khu').ma;
        expect(ba('go-thay')).toBe('bat-dau-duoc');
        expect(ba('noi')).toBe('bat-dau-duoc');
        expect(ba('go')).toBe('bat-dau-duoc');
    });

    test('AI lỗi: câu không ghi vào hồ sơ và không làm bằng chứng chẩn đoán', () => {
        const r = T.chanDoan([
            { kyNang: 'qua-khu', loai: 'trac-nghiem', dung: true },
            { kyNang: 'qua-khu', loai: 'go', dung: false, khongChac: true },
        ]);
        expect(r.find((x) => x.kyNang === 'qua-khu').ma).toBe('chua-chac');
    });

    test('câu sai xem lại kèm đáp án đúng, câu AI lỗi không liệt vào', () => {
        const r = T.cauCanXem([
            { id: 'gt-t1', kyNang: 'mau-giao-tiep', loai: 'trac-nghiem', dung: false },
            { id: 'qk1', kyNang: 'qua-khu', loai: 'go', dung: false },
            { id: 'qk5', kyNang: 'qua-khu', loai: 'go', dung: false, khongChac: true },
        ]);
        expect(r).toHaveLength(2);
        expect(r[0].dapAn).toBe('How much is this?');
        expect(r[1].dapAn).toBe('Yesterday I went to the bank.');
    });
});

describe('mục tiêu', () => {
    test('chỉ nhận mục tiêu đã có đủ nội dung', async () => {
        expect(await HS.datMucTieu('u1', 'toeic')).toBe(false);
        expect(await HS.datMucTieu('u1', 'giao-tiep')).toBe(true);
        expect(mockHoSo.doc.mucTieu).toBe('giao-tiep');
    });
});
