/**
 * Phản xạ câu: chấm, lịch ôn, chọn câu, và tính đúng của kho câu.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Giọng nói không có dấu câu / viết tắt khác → câu đúng bị báo sai.
 *   2. AI lỗi lại tính SAI → lỗi của máy làm người học tụt lịch ôn.
 *   3. Một câu chấm nhiều lần → tốn AI vô hạn, cộng điểm nhiều lần.
 *   4. Đáp án lộ trong phần đề gửi client.
 *   5. Sửa kho làm trùng id → tiến độ của người học trỏ sai câu.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const mockTien = [];
const mockBuoi = {};
jest.mock('../models/PhanXaTienDo', () => ({
    find: jest.fn(() => ({ select: () => ({ lean: async () => mockTien }) })),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
}));
jest.mock('../models/BuoiPhanXa', () => ({
    create: jest.fn(async (d) => { mockBuoi.doc = { _id: 'b1', ...d }; return mockBuoi.doc; }),
    findOne: jest.fn(() => ({ lean: async () => mockBuoi.doc })),
    updateOne: jest.fn(async (q, u) => {
        const k = Object.keys(u.$set)[0];
        const i = Number(k.split('.')[1]);
        if (k.endsWith('.daTra')) {
            if (mockBuoi.doc.cau[i].daTra) return { modifiedCount: 0 };
            mockBuoi.doc.cau[i].daTra = true;
        }
        return { modifiedCount: 1 };
    }),
}));
let mockHoSoDoc = null;
jest.mock('../models/HoSoHocVien', () => ({
    findOne: () => ({ select: () => ({ lean: async () => mockHoSoDoc }) }),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
}));
let mockLang = 'en';
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { vocabLang: mockLang } }) }) }),
}));

const PhanXaTienDo = require('../models/PhanXaTienDo');
const HoSoHocVien = require('../models/HoSoHocVien');
const S = require('../services/phanXa');
const { KHUNG, TAT_CA, THEO_ID, QUY_TAC } = require('../services/phanXaKho');

const NOW = new Date('2026-11-06T05:00:00Z');

beforeEach(() => {
    mockTien.length = 0;
    mockBuoi.doc = null;
    mockLang = 'en';
    chatCompletion.mockReset();
    PhanXaTienDo.updateOne.mockClear();
});

describe('kho câu', () => {
    test('id không trùng; câu nào cũng đủ tiếng Việt và tiếng Anh; đủ 4 khung', () => {
        expect(new Set(TAT_CA.map((c) => c.id)).size).toBe(TAT_CA.length);
        expect(KHUNG).toHaveLength(4);
        for (const c of TAT_CA) {
            expect(c.vi && c.en).toBeTruthy();
            expect(c.id.length).toBeLessThanOrEqual(20);
        }
    });
});

describe('thẻ quy tắc', () => {
    const cau = [{ khung: 'qua-khu', tenKhung: 'Quá khứ' }, { khung: 'tell-say-talk', tenKhung: 'Tell' }];
    const yeu = { d: 0, s: 3 };
    const vung = { d: 5, s: 0 };

    test('khung nào cũng đủ quy tắc và ví dụ', () => {
        for (const k of KHUNG) {
            expect(QUY_TAC[k.key].y.length).toBeGreaterThanOrEqual(2);
            expect(QUY_TAC[k.key].vd.length).toBeGreaterThanOrEqual(2);
        }
    });
    test('ví dụ trên thẻ không trùng đáp án trong kho luyện', () => {
        const dapAn = new Set(TAT_CA.flatMap((c) => [c.en, ...c.chap]).map(S.chuanHoa));
        for (const q of Object.values(QUY_TAC)) {
            for (const v of q.vd) expect(dapAn.has(S.chuanHoa(v.dung))).toBe(false);
        }
    });
    test('tự hiện khi chẩn đoán yếu về quy tắc và điểm còn thấp', () => {
        const r = S.quyTacChoLuot(cau, { chanDoan: [{ kyNang: 'qua-khu', ma: 'chua-nam' }], kyNang: { 'qua-khu': yeu } });
        expect(r.canXem).toEqual(['qua-khu']);
        expect(r.quyTac['tell-say-talk'].y.length).toBeGreaterThan(0);
    });
    test('không làm phiền: đã luyện lên, chẩn đoán khác, khung không trong lượt, chưa có hồ sơ', () => {
        expect(S.quyTacChoLuot(cau, { chanDoan: [{ kyNang: 'qua-khu', ma: 'chua-nam' }], kyNang: { 'qua-khu': vung } }).canXem).toEqual([]);
        expect(S.quyTacChoLuot(cau, { chanDoan: [{ kyNang: 'qua-khu', ma: 'chua-noi-kip' }], kyNang: { 'qua-khu': yeu } }).canXem).toEqual([]);
        expect(S.quyTacChoLuot(cau, { chanDoan: [{ kyNang: 'khung-cau', ma: 'chua-nam' }], kyNang: { 'khung-cau': yeu } }).canXem).toEqual([]);
        expect(S.quyTacChoLuot(cau, null).canXem).toEqual([]);
    });
});

describe('so câu trả lời', () => {
    const c = THEO_ID.get('gt6'); // "Sorry, I'm late."
    test('bỏ qua hoa/thường, dấu câu (giọng nói), viết tắt', () => {
        expect(S.khopKho('sorry i am late', c)).toBe(true);
        expect(S.khopKho("SORRY, I'M LATE!", c)).toBe(true);
        expect(S.khopKho('sorry i’m late', c)).toBe(true);
    });
    test('nhận cách nói khác trong kho; khác nghĩa / rỗng thì không', () => {
        expect(S.khopKho("I'm sorry I'm late", c)).toBe(true);
        expect(S.khopKho('sorry i late', c)).toBe(false);
        expect(S.khopKho('', c)).toBe(false);
    });
    test('phủ định viết tắt = viết đủ', () => {
        expect(S.chuanHoa("I don't have time")).toBe(S.chuanHoa('i do not have time'));
        expect(S.chuanHoa("can't")).toBe('cannot');
    });
});

describe('lịch ôn', () => {
    test('đúng → giãn dần; đúng 3 lần là đã thuộc; sai → ngày mai, về đầu', () => {
        const a = S.capNhatLich(null, true, NOW);
        expect(a.buoc).toBe(1);
        expect(a.denHan.getTime() - NOW.getTime()).toBe(3 * 86400000);
        expect(S.capNhatLich({ buoc: 2 }, true, NOW).daThuoc).toBe(true);
        const s = S.capNhatLich({ buoc: 3 }, false, NOW);
        expect(s).toMatchObject({ buoc: 0, daThuoc: false });
        expect(s.denHan.getTime() - NOW.getTime()).toBe(86400000);
    });
});

describe('chọn câu', () => {
    test('câu đến hạn trước (đủ chỗ thì lấy hết), tối đa 12', () => {
        const tienDo = [
            { cauId: 'qk1', denHan: new Date(NOW.getTime() - 1000), sai: 5 },
            { cauId: 'ts1', denHan: new Date(NOW.getTime() + 86400000), sai: 9 },
        ];
        const r = S.chonCau({ tienDo, now: NOW });
        expect(r).toHaveLength(12);
        expect(r.map((c) => c.id)).toContain('qk1');
        expect(r.map((c) => c.id)).not.toContain('ts1'); // chưa đến hạn
    });
    test('một khung; hết câu thì chỉ `som` mới ôn trước', () => {
        expect(S.chonCau({ khung: 'qua-khu', now: NOW }).every((c) => c.khung === 'qua-khu')).toBe(true);
        const tienDo = TAT_CA.map((c) => ({ cauId: c.id, denHan: new Date(NOW.getTime() + 86400000) }));
        expect(S.chonCau({ tienDo, now: NOW })).toEqual([]);
        expect(S.chonCau({ tienDo, now: NOW, som: true })).toHaveLength(12);
    });
});

describe('một lượt', () => {
    const moBuoi = async () => {
        const { buoi } = await S.taoBuoi('u1', {}, NOW);
        return buoi;
    };

    test('đề KHÔNG có đáp án', async () => {
        const b = await moBuoi();
        expect(b.cau).toHaveLength(12);
        expect(Object.keys(b.cau[0]).sort()).toEqual(['khung', 'tenKhung', 'vi']);
    });

    test('khớp kho → đúng, KHÔNG gọi AI, trả câu đúng', async () => {
        await moBuoi();
        const c = THEO_ID.get(mockBuoi.doc.cau[0].cauId);
        const r = await S.traLoi('u1', 'b1', 0, { traLoi: c.en }, NOW);
        expect(r).toMatchObject({ dung: true, cauDung: c.en });
        expect(chatCompletion).not.toHaveBeenCalled();
        expect(PhanXaTienDo.updateOne.mock.calls[0][1].$inc).toEqual({ dung: 1 });
    });

    test('ghi hồ sơ: khung luôn được tính; kỹ năng Nói chỉ khi thật sự nói', async () => {
        await moBuoi();
        const c = THEO_ID.get(mockBuoi.doc.cau[0].cauId);
        HoSoHocVien.updateOne.mockClear();
        await S.traLoi('u1', 'b1', 0, { traLoi: c.en, cach: 'go' }, NOW);
        expect(Object.keys(HoSoHocVien.updateOne.mock.calls[0][1].$set)).toEqual([`kyNang.${c.khung}`]);
        HoSoHocVien.updateOne.mockClear();
        const c2 = THEO_ID.get(mockBuoi.doc.cau[1].cauId);
        await S.traLoi('u1', 'b1', 1, { traLoi: c2.en, cach: 'noi' }, NOW);
        expect(Object.keys(HoSoHocVien.updateOne.mock.calls[0][1].$set)).toEqual([`kyNang.${c2.khung}`, 'kyNang.noi']);
    });

    test('hồ sơ lỗi không làm hỏng lượt luyện', async () => {
        await moBuoi();
        const c = THEO_ID.get(mockBuoi.doc.cau[0].cauId);
        HoSoHocVien.updateOne.mockRejectedValueOnce(new Error('db'));
        expect((await S.traLoi('u1', 'b1', 0, { traLoi: c.en }, NOW)).dung).toBe(true);
    });

    test('khác kho → hỏi AI; AI nhận đúng thì tính đúng', async () => {
        await moBuoi();
        chatCompletion.mockResolvedValue({ success: true, content: '{"ok":true,"note":""}' });
        const r = await S.traLoi('u1', 'b1', 0, { traLoi: 'một cách nói khác' }, NOW);
        expect(r.dung).toBe(true);
        expect(chatCompletion.mock.calls[0][1]).toMatchObject({ feature: 'phan-xa-cham', maxTokens: 100 });
    });

    test('AI lỗi → không tính sai, không đổi lịch ôn', async () => {
        await moBuoi();
        chatCompletion.mockResolvedValue({ success: false });
        const r = await S.traLoi('u1', 'b1', 0, { traLoi: 'abc' }, NOW);
        expect(r).toMatchObject({ dung: false, khongChac: true });
        expect(PhanXaTienDo.updateOne).not.toHaveBeenCalled();
    });

    test('bỏ qua → tính sai, không gọi AI', async () => {
        await moBuoi();
        const r = await S.traLoi('u1', 'b1', 0, {}, NOW);
        expect(r).toMatchObject({ dung: false, boQua: true });
        expect(chatCompletion).not.toHaveBeenCalled();
    });

    test('trả lời lại cùng câu → 409, không tốn thêm AI', async () => {
        await moBuoi();
        chatCompletion.mockResolvedValue({ success: true, content: '{"ok":false,"note":"x"}' });
        await S.traLoi('u1', 'b1', 0, { traLoi: 'abc' }, NOW);
        expect((await S.traLoi('u1', 'b1', 0, { traLoi: 'abc' }, NOW)).ma).toBe(409);
        expect(chatCompletion).toHaveBeenCalledTimes(1);
    });

    test('người học tiếng Trung: báo chưa hỗ trợ, không mở lượt', async () => {
        mockLang = 'zh';
        expect(await S.tongQuan('u1')).toEqual({ hoTro: false });
        expect(await S.taoBuoi('u1')).toEqual({ buoi: null });
    });
});
