/**
 * Luyện từng công thức ngữ pháp.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Đáp án lộ trong phần đề gửi client.
 *   2. Lưu câu AI sai định dạng vào kho chung → mọi người đều gặp câu hỏng.
 *   3. Mở lại vẫn gọi AI soạn → tốn tiền mãi.
 *   4. Câu chấm hai lần, tổng kết ghi hai lần → lịch ôn nhảy cóc.
 *   5. AI lỗi lại tính sai → lỗi của máy làm người học tụt lịch ôn.
 *   6. Gõ lại nguyên câu sai vẫn tốn một lần gọi AI.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const mockDb = { bo: null, buoi: null, tienDo: null, soBuoi: 0, luot: 0 };
jest.mock('../models/NguPhapBaiTap', () => ({
    findOne: () => ({ lean: async () => mockDb.bo }),
    findOneAndUpdate: jest.fn((q, u) => ({
        lean: async () => {
            mockDb.bo = mockDb.bo || { ...u.$setOnInsert };
            return mockDb.bo;
        },
    })),
}));
jest.mock('../models/BuoiNguPhap', () => ({
    countDocuments: jest.fn(async () => mockDb.soBuoi),
    create: jest.fn(async (d) => {
        mockDb.buoi = { _id: 'b1', daTongKet: false, ...d, cau: d.cau.map((c) => ({ daTra: false, dung: false, khongChac: false, ...c })) };
        return mockDb.buoi;
    }),
    findOne: () => ({ lean: async () => mockDb.buoi && JSON.parse(JSON.stringify(mockDb.buoi)) }),
    updateOne: jest.fn(async (q, u) => {
        if (u.$set.daTongKet) {
            if (mockDb.buoi.daTongKet) return { modifiedCount: 0 };
            mockDb.buoi.daTongKet = true;
            return { modifiedCount: 1 };
        }
        for (const [k, v] of Object.entries(u.$set)) {
            const [, i, f] = k.split('.');
            if (f === 'daTra' && mockDb.buoi.cau[i].daTra) return { modifiedCount: 0 };
            mockDb.buoi.cau[i][f] = v;
        }
        return { modifiedCount: 1 };
    }),
}));
jest.mock('../models/NguPhapTienDo', () => ({
    find: () => ({ select: () => ({ lean: async () => (mockDb.tienDo ? [mockDb.tienDo] : []) }) }),
    findOne: () => ({ select: () => ({ lean: async () => mockDb.tienDo }) }),
    updateOne: jest.fn(async (q, u) => {
        mockDb.tienDo = { mucId: q.mucId, ...u.$set };
        return { modifiedCount: 1 };
    }),
}));
jest.mock('../models/NguPhapMuc', () => ({
    findOne: () => ({ lean: async () => null }),
}));
jest.mock('../models/NguPhapNhap', () => ({}));
jest.mock('../models/NguPhapLuot', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ so: mockDb.luot }) }) }),
    findOneAndUpdate: jest.fn(async () => {
        if (mockDb.luot >= 10) {
            const e = new Error('trùng');
            e.code = 11000;
            throw e;
        }
        mockDb.luot += 1;
        return { so: mockDb.luot };
    }),
    updateOne: jest.fn(async (q, u) => { mockDb.luot += u.$inc.so; return {}; }),
}));
jest.mock('../models/HoSoHocVien', () => ({
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
}));
jest.mock('../models/UserProfile', () => ({}));

const NguPhapTienDo = require('../models/NguPhapTienDo');
const HoSoHocVien = require('../models/HoSoHocVien');
const S = require('../services/nguPhapLuyen');

const NOW = new Date('2026-11-07T05:00:00Z');
const BO_AI = {
    chon: [1, 2, 3, 4].map((n) => ({ de: `Câu ${n} ___`, lua: ['went', 'go', 'gone', 'going'], dapAn: 'went', giaiThich: 'Vì quá khứ.' })),
    sua: [1, 2, 3].map((n) => ({ sai: `I go there ${n}.`, dung: `I went there ${n}.`, vi: `Tôi đã đến đó ${n}.`, giaiThich: 'Sai thì.' })),
    dich: [1, 2, 3].map((n) => ({ vi: `Tôi đã ăn ${n}.`, en: `I ate ${n}.`, giaiThich: 'Dùng quá khứ.' })),
};
const aiTra = (o) => chatCompletion.mockResolvedValue({ success: true, content: JSON.stringify(o) });
const cauTai = (i) => mockDb.bo.cau[mockDb.buoi.cau[i].so];

beforeEach(() => {
    Object.assign(mockDb, { bo: null, buoi: null, tienDo: null, soBuoi: 0, luot: 0 });
    chatCompletion.mockReset();
    NguPhapTienDo.updateOne.mockClear();
    HoSoHocVien.updateOne.mockClear();
});

describe('kiểm định câu AI soạn', () => {
    test('đủ cả ba dạng thì nhận, bỏ trường lạ', () => {
        const r = S.chuanHoaBoCau({ ...BO_AI, hack: 1 });
        expect(r).toHaveLength(10);
        expect(r[0]).toMatchObject({ loai: 'chon', dapAn: 'went' });
        expect(r[9]).toMatchObject({ loai: 'dich', dung: 'I ate 3.' });
    });
    test.each([
        ['đáp án không nằm trong lựa chọn', { ...BO_AI, chon: BO_AI.chon.map((c) => ({ ...c, dapAn: 'x' })) }],
        ['lựa chọn trùng nhau', { ...BO_AI, chon: BO_AI.chon.map((c) => ({ ...c, lua: ['a', 'a', 'b', 'went'] })) }],
        ['câu sửa không có gì để sửa', { ...BO_AI, sua: BO_AI.sua.map((c) => ({ ...c, dung: c.sai })) }],
        ['câu tiếng Anh lại viết tiếng Việt', { ...BO_AI, dich: BO_AI.dich.map((c) => ({ ...c, en: 'Tôi đã ăn' })) }],
        ['thiếu hẳn một dạng', { chon: BO_AI.chon, sua: BO_AI.sua }],
        ['không phải JSON hợp lệ', null],
    ])('từ chối: %s', (_, o) => {
        expect(S.chuanHoaBoCau(o)).toBeNull();
    });
});

describe('soát câu trước khi lưu', () => {
    const bo = S.chuanHoaBoCau(BO_AI);
    /** Lần gọi đầu là soạn, lần sau là soát. */
    const soanRoiSoat = (reject) => {
        chatCompletion.mockReset();
        chatCompletion.mockResolvedValueOnce({ success: true, content: JSON.stringify(BO_AI) });
        chatCompletion.mockResolvedValueOnce(reject === null
            ? { success: false }
            : { success: true, content: JSON.stringify({ reject }) });
    };

    test('câu bị soát là sai không vào kho chung', async () => {
        soanRoiSoat([0, 4]);
        await S.moLuot('u1', 'qua-khu-don', NOW);
        expect(mockDb.bo.cau).toHaveLength(8);
        expect(mockDb.bo.cau.map((c) => c.de)).not.toContain('Câu 1 ___');
    });
    test('soát hỏi đúng lỗi nhiều đáp án đúng', async () => {
        soanRoiSoat([]);
        await S.moLuot('u1', 'qua-khu-don', NOW);
        expect(chatCompletion.mock.calls[1][0][0].content).toMatch(/MORE THAN ONE option/);
    });
    test('loại nhiều quá không còn đủ cơ cấu: không lưu, trả lại lượt', async () => {
        soanRoiSoat([0, 1, 2]);
        expect((await S.moLuot('u1', 'qua-khu-don', NOW)).ma).toBe(503);
        expect(mockDb.bo).toBeNull();
        expect(mockDb.luot).toBe(0);
    });
    test('không soát được: vẫn dùng bộ câu đã qua kiểm định dạng', async () => {
        soanRoiSoat(null);
        expect((await S.moLuot('u1', 'qua-khu-don', NOW)).cau).toHaveLength(5);
        expect(mockDb.bo.cau).toHaveLength(10);
    });
    test('vị trí không hợp lệ không làm mất câu', () => {
        expect(S.boCauLoi(bo, null)).toHaveLength(10);
        expect(S.boCauLoi(bo, ['x', 99])).toHaveLength(10);
    });
});

describe('một lượt', () => {
    test('đúng cơ cấu, đúng thứ tự từ dễ đến khó, không trùng câu', () => {
        const bo = S.chuanHoaBoCau(BO_AI);
        const so = S.chonCauLuot(bo);
        expect(so.map((n) => bo[n].loai)).toEqual(['chon', 'chon', 'sua', 'sua', 'dich']);
        expect(new Set(so).size).toBe(5);
    });
    test('phần gửi client không có đáp án và giải thích', () => {
        const [chon, sua, dich] = [BO_AI.chon[0], BO_AI.sua[0], BO_AI.dich[0]];
        const bo = S.chuanHoaBoCau({ chon: [chon, chon], sua: [sua, sua], dich: [dich] });
        for (const c of bo) {
            const cong = S.congKhai(c);
            expect(cong).not.toHaveProperty('dapAn');
            expect(cong).not.toHaveProperty('dung');
            expect(cong).not.toHaveProperty('giaiThich');
        }
    });
    test('mở lần đầu: AI soạn, tốn một lượt; mở lại: không gọi AI', async () => {
        aiTra(BO_AI);
        const r = await S.moLuot('u1', 'qua-khu-don', NOW);
        expect(r.cau).toHaveLength(5);
        expect(mockDb.luot).toBe(1);
        chatCompletion.mockClear();
        await S.moLuot('u2', 'qua-khu-don', NOW);
        expect(chatCompletion).not.toHaveBeenCalled();
        expect(mockDb.luot).toBe(1);
    });
    test('AI lỗi hoặc soạn sai: không lưu, trả lại lượt', async () => {
        chatCompletion.mockResolvedValue({ success: false });
        expect((await S.moLuot('u1', 'qua-khu-don', NOW)).ma).toBe(503);
        aiTra({ chon: [] });
        expect((await S.moLuot('u1', 'qua-khu-don', NOW)).ma).toBe(503);
        expect(mockDb.bo).toBeNull();
        expect(mockDb.luot).toBe(0);
    });
    test('hết lượt AI mà chưa có bộ câu: 429; đã có bộ câu thì vẫn luyện được', async () => {
        mockDb.luot = 10;
        expect((await S.moLuot('u1', 'qua-khu-don', NOW)).ma).toBe(429);
        expect(chatCompletion).not.toHaveBeenCalled();
        mockDb.bo = { mucId: 'qua-khu-don', cau: S.chuanHoaBoCau(BO_AI) };
        expect((await S.moLuot('u1', 'qua-khu-don', NOW)).cau).toHaveLength(5);
    });
    test('mục không tồn tại: 404; quá trần lượt trong ngày: 429', async () => {
        expect((await S.moLuot('u1', 'khong-co', NOW)).ma).toBe(404);
        mockDb.soBuoi = S.TOI_DA_LUOT_NGAY;
        expect((await S.moLuot('u1', 'qua-khu-don', NOW)).ma).toBe(429);
    });
});

describe('chấm', () => {
    const mo = async () => {
        aiTra(BO_AI);
        await S.moLuot('u1', 'qua-khu-don', NOW);
        chatCompletion.mockReset();
    };

    test('chọn đáp án: so đúng chữ, không gọi AI; trả đáp án và giải thích', async () => {
        await mo();
        expect(await S.traLoi('u1', 'b1', 0, { traLoi: 'went' }, NOW)).toMatchObject({ dung: true, dapAn: 'went', giaiThich: 'Vì quá khứ.' });
        expect((await S.traLoi('u1', 'b1', 1, { traLoi: 'go' }, NOW)).dung).toBe(false);
        expect(chatCompletion).not.toHaveBeenCalled();
    });
    test('câu gõ khớp đáp án (khác hoa thường, dấu câu): đúng, không gọi AI', async () => {
        await mo();
        const r = await S.traLoi('u1', 'b1', 2, { traLoi: cauTai(2).dung.toUpperCase().replace('.', '') }, NOW);
        expect(r.dung).toBe(true);
        expect(chatCompletion).not.toHaveBeenCalled();
    });
    test('gõ lại nguyên câu sai: sai luôn, không tốn AI', async () => {
        await mo();
        expect((await S.traLoi('u1', 'b1', 2, { traLoi: cauTai(2).sai }, NOW)).dung).toBe(false);
        expect(chatCompletion).not.toHaveBeenCalled();
    });
    test('câu khác đáp án: AI quyết định, có ghi chú', async () => {
        await mo();
        aiTra({ ok: true, note: '' });
        expect((await S.traLoi('u1', 'b1', 4, { traLoi: 'Một cách nói khác' }, NOW)).dung).toBe(true);
        expect(chatCompletion).toHaveBeenCalledTimes(1);
    });
    test('AI lỗi: không chắc, không tính vào tổng kết', async () => {
        await mo();
        chatCompletion.mockResolvedValue({ success: false });
        const r = await S.traLoi('u1', 'b1', 4, { traLoi: 'abc' }, NOW);
        expect(r).toMatchObject({ dung: false, khongChac: true });
        expect(S.tongKetLuot(mockDb.buoi.cau.filter((c) => c.daTra)).tong).toBe(0);
    });
    test('chưa biết: tính sai, không gọi AI', async () => {
        await mo();
        expect(await S.traLoi('u1', 'b1', 4, {}, NOW)).toMatchObject({ dung: false, khongChac: false });
        expect(chatCompletion).not.toHaveBeenCalled();
    });
    test('trả lời lại cùng câu: 409, không tốn thêm AI', async () => {
        await mo();
        aiTra({ ok: false, note: 'x' });
        await S.traLoi('u1', 'b1', 4, { traLoi: 'abc' }, NOW);
        expect((await S.traLoi('u1', 'b1', 4, { traLoi: 'abc' }, NOW)).ma).toBe(409);
        expect(chatCompletion).toHaveBeenCalledTimes(1);
    });
});

describe('tổng kết và lịch ôn', () => {
    const lamHet = async (soDung) => {
        aiTra(BO_AI);
        await S.moLuot('u1', 'qua-khu-don', NOW);
        chatCompletion.mockReset();
        let cuoi;
        for (let i = 0; i < 5; i += 1) {
            const c = cauTai(i);
            const traLoi = i < soDung ? (c.loai === 'chon' ? c.dapAn : c.dung) : '';
            cuoi = await S.traLoi('u1', 'b1', i, { traLoi }, NOW);
        }
        return cuoi;
    };

    test('chưa xong câu cuối thì chưa tổng kết', async () => {
        aiTra(BO_AI);
        await S.moLuot('u1', 'qua-khu-don', NOW);
        expect((await S.traLoi('u1', 'b1', 0, { traLoi: 'went' }, NOW)).tongKet).toBeUndefined();
        expect(NguPhapTienDo.updateOne).not.toHaveBeenCalled();
    });
    test('đúng 4/5: đạt, lịch giãn ra', async () => {
        const r = await lamHet(4);
        expect(r.tongKet).toMatchObject({ soDung: 4, tong: 5, dat: true });
        expect(new Date(r.tongKet.denHan).getTime() - NOW.getTime()).toBe(3 * 86400000);
    });
    test('đúng 3/5: chưa đạt, mai ôn lại', async () => {
        const r = await lamHet(3);
        expect(r.tongKet.dat).toBe(false);
        expect(new Date(r.tongKet.denHan).getTime() - NOW.getTime()).toBe(86400000);
    });
    test('tổng kết chỉ ghi một lần', async () => {
        await lamHet(5);
        expect(NguPhapTienDo.updateOne).toHaveBeenCalledTimes(1);
        const sau = JSON.parse(JSON.stringify(mockDb.buoi));
        expect(sau.daTongKet).toBe(true);
    });
    test('mục đo được kỹ năng thì ghi vào hồ sơ; mục khác thì không', async () => {
        await lamHet(5);
        expect(Object.keys(HoSoHocVien.updateOne.mock.calls[0][1].$set)).toEqual(['kyNang.qua-khu']);
        HoSoHocVien.updateOne.mockClear();
        mockDb.bo = null;
        aiTra(BO_AI);
        await S.moLuot('u1', 'bi-dong', NOW);
        chatCompletion.mockReset();
        for (let i = 0; i < 5; i += 1) await S.traLoi('u1', 'b1', i, {}, NOW);
        expect(HoSoHocVien.updateOne).not.toHaveBeenCalled();
    });
    test('gắn tiến độ: đến hạn, đã thuộc; mục chưa luyện giữ nguyên', async () => {
        mockDb.tienDo = { mucId: 'a', denHan: new Date(NOW.getTime() - 1000), daThuoc: true, soLan: 3 };
        const r = await S.ganTienDo('u1', [{ id: 'a' }, { id: 'b' }], NOW);
        expect(r[0].luyen).toEqual({ denHan: true, daThuoc: true, soLan: 3 });
        expect(r[1]).toEqual({ id: 'b' });
    });
});
