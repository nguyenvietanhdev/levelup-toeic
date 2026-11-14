/**
 * Kiểm tra ngữ pháp tổng hợp, mở rộng ngân hàng câu, lịch sử câu đã làm, câu đầy đủ để nghe.
 *
 * Chỗ dễ hỏng: lượt tổng hợp gọi AI (phải chỉ dùng câu đã lưu), dồn hết câu vào một chủ điểm,
 * lấy cả câu đã bị báo sai, lẫn chủ điểm tiếng Trung vào bài tiếng Anh; câu tổng hợp chấm theo
 * nhầm bộ câu; mở rộng soạn lại câu đã có hoặc không trả lượt AI khi hỏng; nút nghe chỉ đọc mỗi
 * từ đáp án ("went") thay vì cả câu.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const mockDb = { bo: [], buoi: null, lichSu: [], thuVien: [], luot: 0, soBuoi: 0 };
jest.mock('../models/NguPhapBaiTap', () => ({
    find: (q) => ({ select: () => ({ lean: async () => mockDb.bo.filter((b) => q.mucId.$in.includes(b.mucId)) }) }),
    findOne: (q) => ({ lean: async () => mockDb.bo.find((b) => b.mucId === q.mucId) || null }),
    findOneAndUpdate: jest.fn(async (q, u) => {
        let b = mockDb.bo.find((x) => x.mucId === q.mucId);
        if (!b) { b = { mucId: q.mucId, cau: [] }; mockDb.bo.push(b); }
        b.cau.push(...u.$push.cau.$each);
        return b;
    }),
}));
jest.mock('../models/BuoiNguPhap', () => ({
    countDocuments: jest.fn(async () => mockDb.soBuoi),
    create: jest.fn(async (d) => {
        mockDb.buoi = { _id: 'b1', daTongKet: false, ...d, cau: d.cau.map((c) => ({ daTra: false, dung: false, khongChac: false, ...c })) };
        return mockDb.buoi;
    }),
    findOne: () => ({ lean: async () => mockDb.buoi && JSON.parse(JSON.stringify(mockDb.buoi)) }),
    updateOne: jest.fn(async (q, u) => {
        if (u.$set?.daTongKet) {
            if (mockDb.buoi.daTongKet) return { modifiedCount: 0 };
            mockDb.buoi.daTongKet = true;
            return { modifiedCount: 1 };
        }
        for (const [k, v] of Object.entries(u.$set || {})) {
            const [, i, f] = k.split('.');
            if (f === 'daTra' && mockDb.buoi.cau[i].daTra) return { modifiedCount: 0 };
            mockDb.buoi.cau[i][f] = v;
        }
        return { modifiedCount: 1 };
    }),
}));
jest.mock('../models/NguPhapTienDo', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/NguPhapLichSu', () => ({
    create: jest.fn(async (d) => { mockDb.lichSu.push({ _id: `ls${mockDb.lichSu.length}`, createdAt: new Date(), ...d }); return d; }),
    find: jest.fn(() => ({ sort: () => ({ limit: (n) => ({ lean: async () => mockDb.lichSu.slice().reverse().slice(0, n) }) }) })),
}));
jest.mock('../models/NguPhapMuc', () => ({
    find: () => ({ select: () => ({ limit: () => ({ lean: async () => mockDb.thuVien }) }) }),
    findOne: (q) => ({
        lean: async () => null,
        select: () => ({ lean: async () => mockDb.thuVien.find((d) => String(d._id) === String(q._id)) || null }),
    }),
}));
jest.mock('../models/NguPhapNhap', () => ({}));
jest.mock('../models/NguPhapLuot', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ so: mockDb.luot }) }) }),
    findOneAndUpdate: jest.fn(async () => { mockDb.luot += 1; return { so: mockDb.luot }; }),
    updateOne: jest.fn(async (q, u) => { mockDb.luot += u.$inc.so; return {}; }),
}));
jest.mock('../models/HoSoHocVien', () => ({
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
}));
jest.mock('../models/UserProfile', () => ({}));

const NguPhapLichSu = require('../models/NguPhapLichSu');
const S = require('../services/nguPhapLuyen');
const { MUC } = require('../services/nguPhapKho');

const EN = MUC.filter((m) => m.lang === 'en');
const ZH = MUC.filter((m) => m.lang === 'zh');
const chon = (n, extra = {}) => ({ loai: 'chon', de: `She ___ home ${n}.`, lua: ['went', 'go', 'gone', 'going'], dapAn: 'went', giaiThich: 'Quá khứ.', ...extra });
const sua = (n) => ({ loai: 'sua', sai: `He go to school ${n}.`, dung: `He goes to school ${n}.`, vi: 'Anh ấy đi học.', giaiThich: 'Ngôi ba số ít.' });
const dich = (n) => ({ loai: 'dich', vi: `Tôi đã ăn ${n}.`, dung: `I ate ${n}.`, giaiThich: 'Quá khứ.' });
const bo = (mucId, cau) => ({ mucId, cau });
const giuNguyen = (a) => a;

beforeEach(() => {
    Object.assign(mockDb, { bo: [], buoi: null, lichSu: [], thuVien: [], luot: 0, soBuoi: 0 });
    chatCompletion.mockReset();
    NguPhapLichSu.create.mockClear();
});

describe('câu đầy đủ để nghe', () => {
    test('câu chọn: điền đáp án vào chỗ trống, không chỉ đọc mỗi từ đáp án', () => {
        expect(S.cauDayDu(chon(1))).toBe('She went home 1.');
        expect(S.cauDayDu({ loai: 'chon', de: '我买___三本书。', dapAn: '了' }, 'zh')).toBe('我买了三本书。');
    });
    test('đề là lời dặn tiếng Việt hoặc nhiều chỗ trống: không ghép được, trả rỗng', () => {
        expect(S.cauDayDu({ loai: 'chon', de: 'Chọn từ đúng: ___', dapAn: 'went' })).toBe('');
        expect(S.cauDayDu({ loai: 'chon', de: 'I ___ and ___.', dapAn: 'went' })).toBe('');
    });
    test('câu sửa và câu dịch: chính là câu đúng', () => {
        expect(S.cauDayDu(sua(1))).toBe('He goes to school 1.');
        expect(S.cauDayDu(dich(1))).toBe('I ate 1.');
    });
});

describe('chọn câu tổng hợp', () => {
    test('mỗi chủ điểm một câu trước khi lấy câu thứ hai: phủ nhiều chủ điểm nhất', () => {
        const ds = [bo('a', [chon(1), chon(2), chon(3)]), bo('b', [sua(1)]), bo('c', [dich(1), dich(2)])];
        const r = S.chonCauTongHop(ds, 3, giuNguyen);
        expect(new Set(r.map((x) => x.mucId))).toEqual(new Set(['a', 'b', 'c']));
    });
    test('bỏ câu đã bị báo sai; xếp chọn → sửa → dịch; hết câu thì dừng', () => {
        const ds = [bo('a', [dich(1), { ...chon(1), an: true }, chon(2)]), bo('b', [sua(1)])];
        const r = S.chonCauTongHop(ds, 15, giuNguyen);
        expect(r.map((x) => x.loai)).toEqual(['chon', 'sua', 'dich']);
        expect(r.find((x) => x.mucId === 'a' && x.so === 1)).toBeUndefined();
    });
    test('kết quả theo chủ điểm: chủ điểm yếu nhất lên đầu, câu không chấm được không tính', () => {
        const r = S.tongKetTheoMuc([
            { mucId: 'a', dung: true }, { mucId: 'a', dung: true },
            { mucId: 'b', dung: false }, { mucId: 'b', dung: true },
            { mucId: 'c', dung: false, khongChac: true },
        ]);
        expect(r).toEqual([{ mucId: 'b', dung: 1, tong: 2 }, { mucId: 'a', dung: 2, tong: 2 }]);
    });
});

describe('mở lượt tổng hợp', () => {
    test('chỉ dùng câu đã lưu (không gọi AI), chỉ lấy chủ điểm cùng ngôn ngữ, không lộ đáp án', async () => {
        mockDb.bo = [
            bo(EN[0].id, [chon(1), chon(2), sua(1)]),
            bo(EN[1].id, [sua(2), dich(1), dich(2)]),
            bo(ZH[0].id, [dich(9), dich(8), dich(7)]),
        ];
        const r = await S.moTongHop('u1', 'en');
        expect(chatCompletion).not.toHaveBeenCalled();
        expect(r.cau).toHaveLength(6);
        expect(mockDb.buoi).toMatchObject({ tongHop: true, lang: 'en', mucId: 'tong-hop:en' });
        expect(mockDb.buoi.cau.every((c) => [EN[0].id, EN[1].id].includes(c.mucId))).toBe(true);
        for (const c of r.cau) {
            expect(c).not.toHaveProperty('dapAn');
            expect(c).not.toHaveProperty('dung');
        }
        expect(r.nganHang).toMatchObject({ soChuDiem: 2, soCau: 6, duMo: true });
    });

    test('ngân hàng còn ít câu: báo mở rộng trước, không tạo lượt', async () => {
        mockDb.bo = [bo(EN[0].id, [chon(1), sua(1)])];
        const r = await S.moTongHop('u1', 'en');
        expect(r).toMatchObject({ ma: 409 });
        expect(r.loi).toMatch(/Mở rộng ngân hàng câu/);
        expect(mockDb.buoi).toBeNull();
    });

    test('chấm câu theo bộ câu của đúng chủ điểm; tổng kết theo chủ điểm; mỗi câu ghi lịch sử', async () => {
        mockDb.bo = [bo(EN[0].id, [chon(1), chon(2), chon(3)]), bo(EN[1].id, [dich(1), dich(2), dich(3)])];
        const r = await S.moTongHop('u1', 'en');
        let cuoi;
        for (let i = 0; i < r.cau.length; i += 1) {
            const { mucId, so } = mockDb.buoi.cau[i];
            const c = mockDb.bo.find((b) => b.mucId === mucId).cau[so];
            // Làm đúng hết câu chọn, bỏ trống câu dịch.
            cuoi = await S.traLoi('u1', 'b1', i, { traLoi: c.loai === 'chon' ? c.dapAn : '' });
            if (i === 0) {
                expect(cuoi).toMatchObject({ dung: true, cauDu: expect.stringMatching(/^She went home/), tenMuc: EN[0].ten, mucId: EN[0].id });
            }
        }
        expect(cuoi.tongKet.theoMuc.map((t) => [t.mucId, t.dung, t.tong])).toEqual([[EN[1].id, 0, 3], [EN[0].id, 3, 3]]);
        expect(cuoi.tongKet.theoMuc[0].ten).toBe(EN[1].ten);
        expect(NguPhapLichSu.create).toHaveBeenCalledTimes(6);
        expect(mockDb.lichSu[0]).toMatchObject({ userId: 'u1', lang: 'en', tongHop: true, loai: 'chon', dung: true, cauDu: expect.stringMatching(/went/) });
    });

    test('ghi lịch sử hỏng thì vẫn chấm bình thường', async () => {
        mockDb.bo = [bo(EN[0].id, [chon(1), chon(2), chon(3), chon(4), chon(5), chon(6)])];
        await S.moTongHop('u1', 'en');
        NguPhapLichSu.create.mockRejectedValueOnce(new Error('db'));
        expect(await S.traLoi('u1', 'b1', 0, { traLoi: 'went' })).toMatchObject({ dung: true });
    });
});

describe('mở rộng ngân hàng câu', () => {
    const BO_AI = {
        chon: [1, 2, 3, 4].map((n) => ({ de: `They ___ out ${n}.`, lua: ['went', 'go', 'gone', 'going'], dapAn: 'went', giaiThich: 'Quá khứ.' })),
        sua: [1, 2, 3].map((n) => ({ sai: `She go ${n}.`, dung: `She went ${n}.`, vi: 'Cô ấy đã đi.', giaiThich: 'Quá khứ.' })),
        dich: [1, 2, 3].map((n) => ({ vi: `Tôi đã đi ${n}.`, en: `I went ${n}.`, giaiThich: 'Quá khứ.' })),
    };

    test('tự chọn chủ điểm chưa có câu; câu trùng câu cũ bị bỏ; dặn AI tránh câu đã có', async () => {
        mockDb.bo = [bo(EN[0].id, [{ ...chon(0), de: 'They ___ out 1.' }])];
        chatCompletion
            .mockResolvedValueOnce({ success: true, content: JSON.stringify(BO_AI) })
            .mockResolvedValueOnce({ success: true, content: '{"reject":[]}' });
        const r = await S.moRongNganHang('u1', 'en');
        // EN[0] đã có câu nên chọn chủ điểm kế tiếp chưa có câu nào.
        expect(r).toMatchObject({ mucId: EN[1].id, them: 10 });
        expect(mockDb.luot).toBe(1);

        chatCompletion.mockReset()
            .mockResolvedValueOnce({ success: true, content: JSON.stringify(BO_AI) })
            .mockResolvedValueOnce({ success: true, content: '{"reject":[0]}' });
        const r2 = await S.moRongNganHang('u1', 'en', EN[0].id);
        // 10 câu AI: 1 bị soát loại (vị trí 0, cũng chính là câu trùng), còn 9.
        expect(r2).toMatchObject({ mucId: EN[0].id, them: 9 });
        expect(chatCompletion.mock.calls[0][0][1].content).toMatch(/already exist[\s\S]*They ___ out 1\./);
    });

    test('AI hỏng: trả lại lượt AI, không ghi gì', async () => {
        chatCompletion.mockResolvedValue({ success: false });
        const r = await S.moRongNganHang('u1', 'en', EN[0].id);
        expect(r).toMatchObject({ ma: 503 });
        expect(mockDb.luot).toBe(0);
        expect(mockDb.bo).toHaveLength(0);
    });

    test('chủ điểm khác ngôn ngữ hoặc không có: từ chối, không tốn lượt', async () => {
        expect(await S.moRongNganHang('u1', 'en', ZH[0].id)).toMatchObject({ ma: 404 });
        expect(mockDb.luot).toBe(0);
    });

    test('chọn mục mở rộng: bỏ mục đã đầy, ưu tiên mục ít câu nhất', () => {
        const ten = new Map([['a', 'A'], ['b', 'B'], ['c', 'C']]);
        const day = Array.from({ length: S.TOI_DA_CAU_MOI_MUC }, (_, n) => chon(n));
        expect(S.chonMucMoRong(ten, [bo('a', day), bo('b', [chon(1), chon(2)]), bo('c', [chon(1)])])).toBe('c');
        expect(S.chonMucMoRong(new Map([['a', 'A']]), [bo('a', day)])).toBeNull();
    });
});

describe('lịch sử', () => {
    test('trả trang 30 câu mới nhất, báo còn nữa', async () => {
        mockDb.lichSu = Array.from({ length: 35 }, (_, n) => ({ _id: `x${n}`, lang: 'en', loai: 'dich', de: `câu ${n}`, dung: n % 2 === 0, createdAt: new Date() }));
        const r = await S.lichSu('u1', { lang: 'en' });
        expect(r.ds).toHaveLength(30);
        expect(r.conNua).toBe(true);
        expect(r.ds[0].de).toBe('câu 34');
    });
    test('lọc chỉ câu sai, chỉ của người này và đúng ngôn ngữ', async () => {
        await S.lichSu('u1', { lang: 'zh', chiSai: true, truoc: '2026-11-01T00:00:00Z' });
        expect(NguPhapLichSu.find).toHaveBeenLastCalledWith({ userId: 'u1', lang: 'zh', dung: false, khongChac: false, createdAt: { $lt: new Date('2026-11-01T00:00:00Z') } });
    });
});
