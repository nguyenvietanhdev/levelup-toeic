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
// Hồ sơ HSK đọc bài Viết/Nói/Đọc/Nghe — ngoài phạm vi file này.
jest.mock('../services/hoSoBang', () => ({ layHoSoBang: async () => null }));
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

describe('so với lần test trước', () => {
    test('chỉ so kỹ năng có ở cả hai lần: thêm Nói điểm thấp không làm tụt', () => {
        const r = HS.soSanhTest([
            { diem: 45, theoKyNang: { nghe: 75, 'qua-khu': 40 } },
            { diem: 38, theoKyNang: { nghe: 80, 'qua-khu': 40, noi: 18 } },
        ]);
        expect(r).toEqual({ chenh: 3, soKyNang: 2 });
    });
    test('bản ghi cũ, một lần test, hoặc không có kỹ năng chung thì không so', () => {
        expect(HS.soSanhTest([{ diem: 45 }, { diem: 38, theoKyNang: { nghe: 80 } }])).toBeNull();
        expect(HS.soSanhTest([{ diem: 38, theoKyNang: { nghe: 80 } }])).toBeNull();
        expect(HS.soSanhTest([{ theoKyNang: { noi: 1 } }, { theoKyNang: { nghe: 80 } }])).toBeNull();
        expect(HS.soSanhTest()).toBeNull();
    });
    test('ảnh kỹ năng bỏ qua kỹ năng chưa đủ dữ liệu', () => {
        expect(HS.anhKyNang([
            { key: 'nghe', diem: 80, duDuLieu: true },
            { key: 'noi', diem: 30, duDuLieu: false },
        ])).toEqual({ nghe: 80 });
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

    test('giới hạn số lượt mỗi ngày', async () => {
        mockBuoi.daMo = T.TOI_DA_MOI_NGAY;
        expect((await T.moTest('u1', {}, NOW)).ma).toBe(429);
    });

    test('ngôn ngữ test phải khớp ngôn ngữ đang học; song ngữ làm được cả hai', () => {
        expect(T.langTest('zh', 'zh')).toEqual({ lang: 'zh' });
        expect(T.langTest('zh', 'bi')).toEqual({ lang: 'zh' });
        expect(T.langTest('en', 'bi')).toEqual({ lang: 'en' });
        expect(T.langTest('zh', 'en').loi).toMatch(/tiếng Trung/);
        expect(T.langTest('en', 'zh').loi).toMatch(/tiếng Anh/);
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

    test('câu sai cho xem máy đã nghe gì, để phân biệt nói sai với nghe nhầm', async () => {
        await T.moTest('u1', {}, NOW);
        mockBuoi.doc.cauHienTai = { id: 'qk1', kyNang: 'qua-khu', loai: 'noi', muc: 1 };
        chatCompletion.mockResolvedValue({ success: true, content: '{"ok":false,"note":""}' });
        await T.traLoiTest('u1', 'b1', { i: 0, traLoi: 'yesterday i want to the bank', cach: 'noi' }, NOW);
        expect(T.cauCanXem(mockBuoi.doc.daLam)[0]).toMatchObject({
            cuaBan: 'yesterday i want to the bank',
            daNoi: true,
        });
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
    test('chỉ nhận mục tiêu có thật', async () => {
        expect(await HS.datMucTieu('u1', 'toefl')).toMatchObject({ ma: 400 });
        expect(await HS.datMucTieu('u1', 'giao-tiep')).toEqual({ ok: true });
        expect(mockHoSo.doc.mucTieu).toBe('giao-tiep');
    });
});

describe('test đầu vào tiếng Trung (HSK)', () => {
    /** Trả lời đúng mọi câu: trắc nghiệm chọn `lua[0]`, câu tự tạo gõ đúng câu mẫu, câu nói thì nói. */
    async function lamHet() {
        const mo = await T.moTest('u1', { lang: 'zh' }, NOW);
        let cau = mo.cau;
        let r = null;
        for (let n = 0; n < 15; n += 1) {
            const q = mockBuoi.doc.cauHienTai;
            let body;
            if (q.loai === 'trac-nghiem' || q.loai === 'nghe') {
                const nguon = q.loai === 'nghe' ? Object.values(T.NGHE_ZH) : Object.values(T.TRAC_NGHIEM_ZH[q.kyNang]);
                body = { chon: nguon.flat().find((x) => x.id === q.id).lua[0] };
            } else {
                body = { traLoi: THEO_ID.get(q.id).en, cach: q.loai === 'noi' ? 'noi' : 'go' };
            }
            r = await T.traLoiTest('u1', 'b1', { i: cau.i, ...body }, NOW);
            cau = r.cau;
        }
        return { mo, r };
    }

    test('bộ đề: mỗi khung đủ câu ở hai mức; câu tự tạo có trong kho Phản xạ tiếng Trung; đáp án không lặp', () => {
        for (const [k, muc] of Object.entries(T.CAU_THEO_MUC_ZH)) {
            for (const ids of Object.values(muc)) for (const id of ids) expect(THEO_ID.get(id)?.khung).toBe(k);
            for (const ds of Object.values(T.TRAC_NGHIEM_ZH[k])) {
                for (const x of ds) expect(new Set(x.lua).size).toBe(4);
            }
        }
        expect(T.BO_DE.zh.keHoach).toHaveLength(15);
    });

    test('câu gửi client mang lang zh, câu nghe đọc chữ Hán', async () => {
        mockLang = 'zh';
        const { mo } = await T.moTest('u1', { lang: 'zh' }, NOW).then((m) => ({ mo: m }));
        expect(mo.lang).toBe('zh');
        expect(mo.cau).toMatchObject({ lang: 'zh', kyNang: 'zh-giao-tiep', tong: 15 });
        expect(mo.cau.hoi).toBeTruthy();
    });

    test('làm xong: ghi vào phần tiếng Trung, mục tiêu HSK, không đè test Giao tiếp', async () => {
        mockLang = 'zh';
        mockHoSo.doc = { kyNang: {}, testNgay: new Date('2026-10-01'), chanDoan: [{ kyNang: 'qua-khu', ma: 'chua-nam' }] };
        const { r } = await lamHet();
        expect(r.xong).toBe(true);
        expect(mockHoSo.doc.mucTieu).toBe('hsk');
        expect(mockHoSo.doc.testNgayZh).toEqual(NOW);
        expect(mockHoSo.doc.testNgay).toEqual(new Date('2026-10-01'));
        expect(mockHoSo.doc.chanDoan).toEqual([{ kyNang: 'qua-khu', ma: 'chua-nam' }]);
        expect(mockHoSo.doc.chanDoanZh.map((c) => c.kyNang)).toEqual(['zh-trat-tu', 'zh-da-lam', 'zh-luong-tu', 'zh-giao-tiep', 'zh-nghe']);
        expect(mockHoSo.doc.chanDoanZh.every((c) => c.ma === 'vung')).toBe(true);
        for (const k of ['zh-trat-tu', 'zh-nghe', 'zh-noi']) expect(mockHoSo.doc.kyNang[k]).toBeTruthy();
        expect(mockHoSo.doc.kyNang.noi).toBeUndefined();
        // Hồ sơ trả về có nền tảng câu tiếng Trung cho mục tiêu HSK.
        expect(r.hoSo.nenTang.testNgay).toEqual(NOW);
        expect(r.hoSo.nenTang.kyNang.map((k) => k.key)).toContain('zh-noi');
    });

    test('câu sai cần xem lại kèm pinyin', () => {
        const ds = T.cauCanXem([{ id: 'zh-tt1', kyNang: 'zh-trat-tu', loai: 'go', dung: false, cuaBan: '我学习在家明天' }]);
        expect(ds[0]).toMatchObject({ dapAn: '我明天在家学习。', pinyin: 'Wǒ míngtiān zài jiā xuéxí.' });
    });
});

describe('nền tảng câu tiếng Trung (thuần)', () => {
    test('chưa test: không có ngày; trọng tâm là khung tiếng Trung, không lẫn khung tiếng Anh', () => {
        const nt = HS.nenTangZh({ kyNang: { 'qua-khu': { d: 0, s: 5, soLan: 5 } } });
        expect(nt.testNgay).toBeNull();
        expect(nt.trongTam.khung.startsWith('zh-')).toBe(true);
        expect(nt.kyNang.map((k) => k.key)).not.toContain('qua-khu');
    });
});
