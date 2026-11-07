/**
 * Báo nội dung ngữ pháp do AI tạo bị sai.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Câu đã báo vẫn hiện lại, hoặc báo xong làm lệch vị trí câu của lượt đang làm.
 *   2. Báo nhiều quá hết câu mà không soạn bổ sung → công thức đó không luyện được nữa.
 *   3. Ai cũng dò ẩn được cả kho.
 *   4. Ẩn mục nhưng còn cách gọi trỏ tới → tra ra đường cụt; hoặc tên bị giữ, không tạo lại được.
 *   5. Mất nội dung, không khôi phục được khi báo nhầm.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const mockDb = { buoi: null, bo: null, baoCao: [], soBaoHomNay: 0, muc: null, xoaCachGoi: [] };
jest.mock('../models/BuoiNguPhap', () => ({
    findOne: () => ({ lean: async () => mockDb.buoi }),
    countDocuments: async () => 0,
    create: async (d) => { mockDb.buoi = { _id: 'b1', ...d }; return mockDb.buoi; },
    updateOne: jest.fn(async (q, u) => {
        for (const [k, v] of Object.entries(u.$set)) {
            const [, i, f] = k.split('.');
            mockDb.buoi.cau[i][f] = v;
        }
        return { modifiedCount: 1 };
    }),
}));
jest.mock('../models/NguPhapBaiTap', () => ({
    findOne: () => ({ lean: async () => mockDb.bo }),
    updateOne: jest.fn(async (q, u) => {
        for (const k of Object.keys(u.$set)) mockDb.bo.cau[k.split('.')[1]].an = true;
        return { modifiedCount: 1 };
    }),
    findOneAndUpdate: jest.fn((q, u) => ({
        lean: async () => {
            if (u.$push) mockDb.bo.cau.push(...u.$push.cau.$each);
            else mockDb.bo = { ...u.$setOnInsert };
            return mockDb.bo;
        },
    })),
}));
jest.mock('../models/NguPhapBaoSai', () => ({
    countDocuments: async () => mockDb.soBaoHomNay,
    updateOne: jest.fn(async (q, u) => { mockDb.baoCao.push(u.$setOnInsert); return {}; }),
}));
jest.mock('../models/NguPhapMuc', () => ({
    findOne: () => ({ lean: async () => mockDb.muc }),
    updateOne: jest.fn(async (q, u) => { Object.assign(mockDb.muc, u.$set); return {}; }),
    deleteMany: jest.fn(async (q) => { mockDb.xoaCachGoi.push(q); return {}; }),
}));
jest.mock('../models/NguPhapNhap', () => ({}));
jest.mock('../models/NguPhapTienDo', () => ({}));
let mockLuot = 0;
jest.mock('../models/NguPhapLuot', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ so: mockLuot }) }) }),
    findOneAndUpdate: jest.fn(async () => { mockLuot += 1; return { so: mockLuot }; }),
    updateOne: jest.fn(async (q, u) => { mockLuot += u.$inc.so; return {}; }),
}));
jest.mock('../models/HoSoHocVien', () => ({}));
jest.mock('../models/UserProfile', () => ({}));

const S = require('../services/nguPhapBaoSai');
const L = require('../services/nguPhapLuyen');
const { tomTat } = require('../scripts/xemBaoSai');

const NOW = new Date('2026-11-07T05:00:00Z');
const ID = 'a'.repeat(24);
const taoBo = () => [
    ...[1, 2, 3, 4].map((n) => ({ loai: 'chon', de: `Câu ${n} ___`, lua: ['a', 'b', 'c', 'd'], dapAn: 'a', giaiThich: 'g' })),
    ...[1, 2, 3].map((n) => ({ loai: 'sua', sai: `Wrong ${n}.`, dung: `Right ${n}.`, vi: 'v', giaiThich: 'g' })),
    ...[1, 2, 3].map((n) => ({ loai: 'dich', vi: `Dịch ${n}`, dung: `Text ${n}.`, giaiThich: 'g' })),
];
const BO_AI = {
    chon: [5, 6].map((n) => ({ de: `Câu ${n} ___`, lua: ['a', 'b', 'c', 'd'], dapAn: 'a', giaiThich: 'g' })),
    sua: [5, 6].map((n) => ({ sai: `Wrong ${n}.`, dung: `Right ${n}.`, vi: 'v', giaiThich: 'g' })),
    dich: [{ vi: 'Dịch 5', en: 'Text 5.', giaiThich: 'g' }],
};

beforeEach(() => {
    Object.assign(mockDb, {
        buoi: { _id: 'b1', mucId: 'bi-dong', cau: [{ so: 0, daTra: true, dung: false }, { so: 1, daTra: false }] },
        bo: { mucId: 'bi-dong', cau: taoBo() },
        baoCao: [],
        soBaoHomNay: 0,
        muc: { _id: ID, khoa: 'hoi:dao ngu', tenChuan: 'dao ngu', timKiem: 'dao ngu', noiDung: { ten: 'Đảo ngữ' } },
        xoaCachGoi: [],
    });
    mockLuot = 0;
    chatCompletion.mockReset();
});

describe('báo câu luyện', () => {
    test('ẩn câu, giữ bản sao, câu đó không tính vào kết quả lượt', async () => {
        expect(await S.baoSaiCau('u1', 'b1', 0, NOW)).toEqual({ daBao: true });
        expect(mockDb.bo.cau[0].an).toBe(true);
        expect(mockDb.baoCao[0]).toMatchObject({ loai: 'cau', mucId: 'bi-dong', so: 0 });
        expect(mockDb.baoCao[0].banSao.de).toBe('Câu 1 ___');
        expect(mockDb.buoi.cau[0].khongChac).toBe(true);
    });
    test('không xoá khỏi mảng: vị trí câu của các lượt đang làm không lệch', async () => {
        await S.baoSaiCau('u1', 'b1', 0, NOW);
        expect(mockDb.bo.cau).toHaveLength(10);
    });
    test('chưa trả lời thì chưa báo được: không dò được đáp án hay ẩn bừa', async () => {
        expect((await S.baoSaiCau('u1', 'b1', 1, NOW)).ma).toBe(400);
        expect(mockDb.bo.cau[1].an).toBeUndefined();
    });
    test('lượt của người khác hoặc câu không có: 404', async () => {
        mockDb.buoi = null;
        expect((await S.baoSaiCau('u2', 'b1', 0, NOW)).ma).toBe(404);
    });
    test('quá trần trong ngày: 429, không ẩn gì', async () => {
        mockDb.soBaoHomNay = S.TOI_DA_BAO_NGAY;
        expect((await S.baoSaiCau('u1', 'b1', 0, NOW)).ma).toBe(429);
        expect(mockDb.bo.cau[0].an).toBeUndefined();
    });
});

describe('sau khi báo', () => {
    test('câu đã ẩn không vào lượt mới', () => {
        const bo = taoBo();
        bo[0].an = true;
        bo[1].an = true;
        for (let n = 0; n < 20; n += 1) expect(L.chonCauLuot(bo)).not.toEqual(expect.arrayContaining([0]));
    });
    test('còn đủ câu: không gọi AI', async () => {
        mockDb.bo.cau[0].an = true;
        const r = await L.moLuot('u1', 'bi-dong', NOW);
        expect(r.cau).toHaveLength(5);
        expect(chatCompletion).not.toHaveBeenCalled();
    });
    test('hết đủ câu: AI soạn bổ sung, nối vào cuối, tốn một lượt', async () => {
        mockDb.bo.cau.forEach((c) => { if (c.loai === 'chon') c.an = true; });
        chatCompletion
            .mockResolvedValueOnce({ success: true, content: JSON.stringify(BO_AI) })
            .mockResolvedValueOnce({ success: true, content: '{"reject":[]}' });
        const r = await L.moLuot('u1', 'bi-dong', NOW);
        expect(r.cau).toHaveLength(5);
        expect(mockDb.bo.cau).toHaveLength(15);
        expect(mockDb.bo.cau[0].an).toBe(true);
        expect(mockLuot).toBe(1);
    });
    test('AI soạn lại đúng câu đã bị báo: không nhận', async () => {
        mockDb.bo.cau.forEach((c) => { if (c.loai === 'chon') c.an = true; });
        const lai = { ...BO_AI, chon: [1, 2].map((n) => ({ de: `Câu ${n} ___`, lua: ['a', 'b', 'c', 'd'], dapAn: 'a', giaiThich: 'g' })) };
        chatCompletion
            .mockResolvedValueOnce({ success: true, content: JSON.stringify(lai) })
            .mockResolvedValueOnce({ success: true, content: '{"reject":[]}' });
        expect((await L.moLuot('u1', 'bi-dong', NOW)).ma).toBe(503);
        expect(mockLuot).toBe(0);
    });
});

describe('báo mục trong thư viện', () => {
    test('ẩn, trả lại tên để tạo lại được, bỏ cách gọi trỏ tới, giữ bản sao', async () => {
        expect(await S.baoSaiMuc('u1', ID, NOW)).toEqual({ daBao: true });
        expect(mockDb.muc).toMatchObject({ noiDung: null, khoa: `an:${ID}`, tenChuan: '', timKiem: '' });
        expect(mockDb.xoaCachGoi[0]).toEqual({ troDen: ID });
        expect(mockDb.baoCao[0].banSao).toMatchObject({ khoa: 'hoi:dao ngu', noiDung: { ten: 'Đảo ngữ' } });
    });
    test('kho lõi viết tay không báo ẩn được', async () => {
        expect((await S.baoSaiMuc('u1', 'bi-dong', NOW)).ma).toBe(400);
    });
    test('mục đã ẩn: 404', async () => {
        mockDb.muc.noiDung = null;
        expect((await S.baoSaiMuc('u1', ID, NOW)).ma).toBe(404);
    });
    test('quá trần trong ngày: 429, không ẩn gì', async () => {
        mockDb.soBaoHomNay = S.TOI_DA_BAO_NGAY;
        expect((await S.baoSaiMuc('u1', ID, NOW)).ma).toBe(429);
        expect(mockDb.muc.noiDung).toEqual({ ten: 'Đảo ngữ' });
    });
});

describe('xem báo cáo', () => {
    test('tóm tắt đọc được cho cả bốn loại', () => {
        expect(tomTat({ loai: 'muc', banSao: { noiDung: { ten: 'X' } } })).toContain('X');
        expect(tomTat({ loai: 'cau', banSao: { loai: 'chon', de: 'A', lua: ['b'], dapAn: 'b' } })).toContain('=> b');
        expect(tomTat({ loai: 'cau', banSao: { loai: 'sua', sai: 'A', dung: 'B' } })).toContain('A => B');
        expect(tomTat({ loai: 'cau', banSao: { loai: 'dich', vi: 'A', dung: 'B' } })).toContain('A => B');
    });
});
