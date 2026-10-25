/**
 * Tổng kết tuần (AI) — tầng 3 của hồ sơ năng lực.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Gọi AI mỗi lần mở màn / bấm lại → tốn tiền và ra lời khuyên khác nhau trong cùng tuần.
 *   2. Gọi AI khi chưa có dữ liệu → văn mẫu rỗng tuếch.
 *   3. Tin `step` AI trả về → client mở màn không tồn tại.
 *   4. Gửi thông tin cá nhân / nội dung bài cho AI (chỉ cần số liệu).
 *   5. Hai lần bấm song song → lỗi khoá trùng hiện cho người dùng.
 */
const mockDb = { doc: null, created: [] };
let mockLoiTrung = false;
jest.mock('../models/TongKetTuan', () => ({
    findOne: () => ({ lean: async () => mockDb.doc }),
    create: async (d) => {
        if (mockLoiTrung) { mockDb.doc = { ...d, createdAt: new Date() }; const e = new Error('dup'); e.code = 11000; throw e; }
        mockDb.created.push(d);
        return { ...d, createdAt: new Date() };
    },
}));
let mockHoSo;
jest.mock('../services/tienBo', () => ({ layTienBo: async () => mockHoSo }));
const mockAi = { calls: [], content: '' };
jest.mock('../config/openai', () => ({
    chatCompletion: async (messages, opts) => { mockAi.calls.push({ messages, opts }); return { success: true, content: mockAi.content }; },
}));

const { taoTongKet, layTongKet, chuanHoaKetQua, tomTatChoAI } = require('../services/tongKetTuan');

const HO_SO = {
    lang: 'en',
    kyNang: [
        { ten: 'Đọc hiểu', donVi: '%', truoc: 50, ganDay: 80, xuHuong: 'len', soLuot: 6 },
        { ten: 'Nghe', donVi: '%', truoc: null, ganDay: null, xuHuong: null, soLuot: 0 },
    ],
    nguPhap: [{ key: 'tense', vi: 'Thì của động từ', count: 5, truoc: 2, ganDay: 1, xuHuong: 'giam' }],
    tieuChiNoi: [],
    tuVung: { dangOn: 3, denHan: 1, daThuoc: 2, moiThuoc: 0 },
};
const TRA_LOI = JSON.stringify({
    summary: 'Bạn tiến bộ ở Đọc hiểu: 50% → 80%.',
    better: ['Đọc hiểu 50% → 80%'],
    focus: ['Thì của động từ'],
    plan: [{ task: 'Làm 3 bài đọc', step: 'doc' }, { task: 'Bịa', step: 'hack-screen' }, { task: '', step: 'nghe' }],
});

beforeEach(() => {
    mockDb.doc = null;
    mockDb.created.length = 0;
    mockLoiTrung = false;
    mockHoSo = JSON.parse(JSON.stringify(HO_SO));
    mockAi.calls.length = 0;
    mockAi.content = TRA_LOI;
});

describe('kiểm lại đầu ra AI', () => {
    test('step lạ bị xoá, task rỗng bị bỏ, tối đa 3 mục', () => {
        const r = chuanHoaKetQua(JSON.parse(TRA_LOI));
        expect(r.keHoach).toEqual([{ viec: 'Làm 3 bài đọc', buoc: 'doc' }, { viec: 'Bịa', buoc: '' }]);
        expect(chuanHoaKetQua({ better: Array(9).fill('x'), summary: 's' }).tienBo).toHaveLength(3);
    });

    test('rỗng / sai hình dạng → null', () => {
        expect(chuanHoaKetQua(null)).toBeNull();
        expect(chuanHoaKetQua({ better: ['x'] })).toBeNull();
    });
});

describe('dữ liệu gửi AI', () => {
    test('chỉ số liệu: bỏ kỹ năng chưa làm, không có id/email/nội dung bài', () => {
        const d = tomTatChoAI(HO_SO);
        expect(d.skills.map((s) => s.name)).toEqual(['Đọc hiểu']);
        // Thang điểm phải đi kèm số — thiếu thì AI tự đoán (từng ghi "4.3/5" cho thang 9).
        expect(d.skills[0].scale).toBe('percent 0-100');
        expect(tomTatChoAI({ ...HO_SO, tieuChiNoi: [{ label: 'Ngữ pháp', truoc: 4, ganDay: 4.3 }] })
            .speakingCriteria[0].scale).toBe('band 0-9');
        expect(JSON.stringify(d)).not.toMatch(/userId|email|@/);
    });
});

describe('tạo tổng kết', () => {
    test('chưa có → gọi AI một lần, lưu, trả về', async () => {
        const r = await taoTongKet('u1', new Date('2026-10-25T05:00:00Z'));
        expect(r.daCo).toBe(false);
        expect(r.tongKet.tuan).toBe('2026-10-19');
        expect(mockAi.calls).toHaveLength(1);
        expect(mockAi.calls[0].opts).toMatchObject({ feature: 'weekly-review', maxTokens: 500 });
        expect(mockDb.created[0]).toMatchObject({ userId: 'u1', tuan: '2026-10-19', lang: 'en' });
    });

    test('đã có tuần này → trả bản đã lưu, KHÔNG gọi AI', async () => {
        mockDb.doc = { tuan: '2026-10-19', tomTat: 'cũ', tienBo: [], canLuyen: [], keHoach: [] };
        const r = await taoTongKet('u1');
        expect(r).toMatchObject({ daCo: true, tongKet: { tomTat: 'cũ' } });
        expect(mockAi.calls).toHaveLength(0);
    });

    test('ít dữ liệu → báo lỗi, KHÔNG gọi AI', async () => {
        mockHoSo.kyNang[0].soLuot = 2;
        const r = await taoTongKet('u1');
        expect(r.ma).toBe('it-du-lieu');
        expect(mockAi.calls).toHaveLength(0);
    });

    test('AI trả rác → lỗi "ai", không lưu', async () => {
        mockAi.content = 'xin lỗi tôi không biết';
        expect((await taoTongKet('u1')).ma).toBe('ai');
        expect(mockDb.created).toHaveLength(0);
    });

    test('bấm song song (khoá trùng) → trả bản lần kia đã lưu', async () => {
        mockLoiTrung = true;
        const r = await taoTongKet('u1');
        expect(r.daCo).toBe(true);
        expect(r.tongKet.tomTat).toMatch(/Đọc hiểu/);
    });

    test('layTongKet chỉ đọc, không gọi AI', async () => {
        const r = await layTongKet('u1', 'en', new Date('2026-10-25T05:00:00Z'));
        expect(r).toEqual({ tuan: '2026-10-19', tongKet: null });
        expect(mockAi.calls).toHaveLength(0);
    });
});
