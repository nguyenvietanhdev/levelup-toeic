/**
 * Kiểm tra lại lỗi đã chữa — nhận ra, sửa được, hiểu vì sao, áp dụng vào câu MỚI.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Câu mới AI sinh bị hỏng (chỗ sai không có trong câu, sửa xong không ra câu đúng)
 *      → người học bị chấm sai oan.
 *   2. "Bấm chỗ sai" chọn cả câu cũng được tính đúng.
 *   3. Đúng hai lần trong CÙNG một ngày đã được tính "đã nắm".
 *   4. Sai câu mới (sau khi làm đúng câu cũ) không bị gắn "nghi học vẹt".
 *   5. Đáp án lộ ra trong phần đề gửi client.
 *   6. Một câu trả lời hai lần được tính hai lần.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const mockLoi = [];
const mockBuoi = {};
const mockKho = [];
jest.mock('../models/LoiOn', () => ({
    bulkWrite: jest.fn(async () => ({ upsertedCount: 0 })),
    countDocuments: jest.fn(async () => 0),
    findOne: jest.fn((q) => ({
        sort: () => ({ select: () => ({ lean: async () => null }) }),
        lean: async () => mockLoi.find((l) => String(l._id) === String(q._id)) || null,
    })),
    find: jest.fn(() => ({ sort: () => ({ limit: () => ({ lean: async () => mockLoi }) }) })),
    updateOne: jest.fn(async (q, u) => {
        const l = mockLoi.find((x) => String(x._id) === String(q._id));
        if (l) Object.assign(l, u.$set);
        return { modifiedCount: 1 };
    }),
}));
jest.mock('../models/CauLuyenLoi', () => ({
    find: jest.fn(() => ({ limit: () => ({ lean: async () => mockKho }) })),
    insertMany: jest.fn(async (ds) => { mockKho.push(...ds.map((d, i) => ({ _id: `k${i}`, ...d }))); }),
}));
jest.mock('../models/BuoiOnLoi', () => ({
    create: jest.fn(async (d) => { mockBuoi.doc = { _id: 'b1', ...d }; return mockBuoi.doc; }),
    findOne: jest.fn(async () => mockBuoi.doc),
    updateOne: jest.fn(async (q, u) => {
        const k = Object.keys(q).find((x) => x.startsWith('cau.'));
        const i = Number(k.split('.')[1]);
        if (mockBuoi.doc.cau[i].daTra) return { modifiedCount: 0 };
        mockBuoi.doc.cau[i].daTra = true;
        return { modifiedCount: 1 };
    }),
}));
const rong = () => ({ select: () => ({ lean: async () => [] }) });
jest.mock('../models/Essay', () => ({ find: rong }));
jest.mock('../models/Translation', () => ({ find: rong }));
jest.mock('../models/Conversation', () => ({ find: rong }));
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { vocabLang: 'en' } }) }) }),
}));

const S = require('../services/onLoi');

const NGAY1 = new Date('2026-10-26T05:00:00Z');
const NGAY3 = new Date('2026-10-28T05:00:00Z');

beforeEach(() => {
    mockLoi.length = 0;
    mockKho.length = 0;
    mockBuoi.doc = null;
    chatCompletion.mockReset();
});

describe('định vị và câu chứa lỗi', () => {
    test('tìm trích dẫn: nguyên văn → không phân biệt hoa/thường → bỏ qua khoảng trắng', () => {
        expect(S.viTriTrong('Yesterday I go home.', 'I go')).toEqual({ start: 10, end: 14 });
        expect(S.viTriTrong('Yesterday I go home.', 'yesterday i')).toEqual({ start: 0, end: 11 });
        expect(S.viTriTrong('Hello Anna!\n\nMy name', 'Anna! My')).toEqual({ start: 6, end: 15 });
        expect(S.viTriTrong('abc', 'xyz')).toBeNull();
    });

    test('câu chứa lỗi: mở rộng tới dấu kết câu, kể cả lỗi trải 2 câu', () => {
        const bai = 'I like tea. Yesterday I go to school by bus. It was fun.';
        expect(S.cauChua(bai, 'I go')).toBe('Yesterday I go to school by bus.');
        expect(S.cauChua(bai, 'tea. Yesterday')).toBe('I like tea. Yesterday I go to school by bus.');
        expect(S.cauChua('我昨天去学校。今天很好。', '去学校')).toBe('我昨天去学校。');
    });
});

describe('chấm "bấm vào chỗ sai"', () => {
    const cau = 'Yesterday I go to school.';
    const span = { start: 12, end: 14 }; // "go"
    test('chọn đúng từ sai (hoặc cả cụm quanh nó trong ranh giới từ) → đúng', () => {
        expect(S.chamTimLoi({ start: 12, end: 14 }, span, cau, 'en')).toBe(true);
    });
    test('chọn thừa ra ngoài / chọn cả câu / không chạm → sai', () => {
        expect(S.chamTimLoi({ start: 10, end: 14 }, span, cau, 'en')).toBe(false);
        expect(S.chamTimLoi({ start: 0, end: cau.length }, span, cau, 'en')).toBe(false);
        expect(S.chamTimLoi({ start: 15, end: 17 }, span, cau, 'en')).toBe(false);
        expect(S.chamTimLoi({ start: 'x', end: 3 }, span, cau, 'en')).toBe(false);
    });
    test('tiếng Trung chấm theo từng chữ', () => {
        expect(S.chamTimLoi({ start: 3, end: 4 }, { start: 3, end: 4 }, '我昨天去学校', 'zh')).toBe(true);
        expect(S.chamTimLoi({ start: 2, end: 4 }, { start: 3, end: 4 }, '我昨天去学校', 'zh')).toBe(false);
    });
});

describe('kiểm câu mới AI sinh', () => {
    const tot = { wrong: 'She go to work every day.', error: 'go', fix: 'goes', correct: 'She goes to work every day.', why: 'Ngôi thứ ba số ít' };
    test('câu hợp lệ được nhận', () => {
        expect(S.kiemCauMoi(tot)).toMatchObject({ sai: tot.wrong, chiSai: 'go', sua: 'goes', dung: tot.correct });
    });
    test('loại câu hỏng: chỗ sai không có / lặp hai lần, sửa không ra câu đúng, sai = đúng', () => {
        expect(S.kiemCauMoi({ ...tot, error: 'went' })).toBeNull();
        expect(S.kiemCauMoi({ ...tot, wrong: 'I go and go.', error: 'go', correct: 'I goes and go.' })).toBeNull();
        expect(S.kiemCauMoi({ ...tot, correct: 'She went to work every day.' })).toBeNull();
        expect(S.kiemCauMoi({ ...tot, fix: 'go', correct: tot.wrong })).toBeNull();
        expect(S.kiemCauMoi({ wrong: 'x' })).toBeNull();
    });
});

describe('luật nấc', () => {
    const goc = { nac: 0, buoc: 0, ngayApDung: [], daNam: false, nghiHocVet: false, loai: 'tense' };

    test('đúng → lên nấc, giãn lịch ôn', () => {
        const r = S.capNhatSauTraLoi(goc, { dang: 'tim-loi', dung: true }, NGAY1);
        expect(r.nac).toBe(1);
        expect(r.buoc).toBe(1);
        expect(r.denHan.getTime() - NGAY1.getTime()).toBe(S.KHOANG[1] * 86400000);
    });

    test('ĐÃ NẮM chỉ khi qua nấc áp dụng ở 2 NGÀY khác nhau', () => {
        const n3 = { ...goc, nac: 3, buoc: 2 };
        const a = S.capNhatSauTraLoi(n3, { dang: 'cau-moi', dung: true }, NGAY1);
        expect(a.daNam).toBe(false);
        const cungNgay = S.capNhatSauTraLoi({ ...n3, ...a }, { dang: 'cau-moi', dung: true }, NGAY1);
        expect(cungNgay.daNam).toBe(false);
        const khacNgay = S.capNhatSauTraLoi({ ...n3, ...a }, { dang: 'cau-moi', dung: true }, NGAY3);
        expect(khacNgay).toMatchObject({ daNam: true, moiDaNam: true });
    });

    test('sai CÂU MỚI → nghi học vẹt, lùi về nấc 2; đúng câu mới sau đó thì gỡ nhãn', () => {
        const r = S.capNhatSauTraLoi({ ...goc, nac: 3 }, { dang: 'cau-moi', dung: false }, NGAY1);
        expect(r).toMatchObject({ nghiHocVet: true, moiNghiHocVet: true, nac: 2, buoc: 0 });
        const lai = S.capNhatSauTraLoi({ ...goc, ...r, nac: 3 }, { dang: 'cau-moi', dung: true }, NGAY3);
        expect(lai.nghiHocVet).toBe(false);
    });

    test('đã nắm mà sai lại → mất "đã nắm", đếm lại', () => {
        const r = S.capNhatSauTraLoi({ ...goc, nac: 3, daNam: true, ngayApDung: ['a', 'b'] }, { dang: 'sua-loi', dung: false }, NGAY1);
        expect(r).toMatchObject({ daNam: false, ngayApDung: [] });
    });

    test('dạng theo nấc; loại "Khác" không có lý do / câu mới → sửa câu cũ', () => {
        expect(S.chonDang({ nac: 0, loai: 'tense' }, true)).toBe('tim-loi');
        expect(S.chonDang({ nac: 1, loai: 'tense' }, true)).toBe('sua-loi');
        expect(S.chonDang({ nac: 2, loai: 'tense' }, true)).toBe('ly-do');
        expect(S.chonDang({ nac: 2, loai: 'other' }, false)).toBe('sua-loi');
        expect(S.chonDang({ nac: 3, loai: 'tense' }, true)).toBe('cau-moi');
        expect(S.chonDang({ nac: 3, loai: 'tense' }, false)).toBe('sua-loi');
    });
});

describe('buổi ôn', () => {
    const LOI = (o = {}) => ({
        _id: `l${mockLoi.length}`, lang: 'en', cau: 'Yesterday I go to school.', quote: 'I go', sua: 'I went',
        issue: 'Quá khứ', loai: 'tense', nac: 0, buoc: 0, ngayApDung: [], daGap: [], lichSu: [], ...o,
    });

    test('đề gửi client KHÔNG có đáp án; có câu thêm "Đúng hay sai"', async () => {
        mockLoi.push(LOI(), LOI({ nac: 1 }), LOI({ nac: 2 }));
        const { buoi } = await S.taoBuoi('u1', {}, NGAY1);
        expect(buoi.cau.map((c) => c.dang)).toEqual(expect.arrayContaining(['tim-loi', 'sua-loi', 'ly-do', 'dung-sai']));
        // Tìm lỗi / Sửa lỗi: không lộ cách sửa. (Câu "vì sao sửa X → Y" thì cố ý hiện cách
        // sửa; câu "Đúng hay sai" có thể chính là câu đã sửa.)
        for (const c of buoi.cau.filter((x) => x.dang === 'tim-loi' || x.dang === 'sua-loi')) {
            expect(JSON.stringify(c.de)).not.toMatch(/I went/);
        }
        // Không câu nào lộ lời giải thích hay trường đáp án.
        const s = JSON.stringify(buoi.cau);
        expect(s).not.toMatch(/Quá khứ/);
        expect(s).not.toMatch(/dapAn|coLoi|"loai":"tense"/);
    });

    test('nấc 3: lấy câu mới từ kho; kho trống thì nhờ AI sinh (chỉ nhận câu qua kiểm)', async () => {
        mockLoi.push(LOI({ nac: 3 }));
        chatCompletion.mockResolvedValue({
            success: true,
            content: JSON.stringify({ items: [
                { wrong: 'She go to work.', error: 'go', fix: 'goes', correct: 'She goes to work.', why: 'x' },
                { wrong: 'hỏng', error: 'zz', fix: 'y', correct: 'k' },
            ] }),
        });
        const { buoi } = await S.taoBuoi('u1', {}, NGAY1);
        expect(chatCompletion).toHaveBeenCalledTimes(1);
        expect(mockKho).toHaveLength(1);
        const c = buoi.cau.find((x) => x.dang === 'cau-moi');
        expect(c.de.cau).toBe('She go to work.');
        expect(JSON.stringify(c.de)).not.toMatch(/goes/);
    });

    test('AI lỗi → nấc 3 lùi về sửa câu cũ, buổi vẫn mở được', async () => {
        mockLoi.push(LOI({ nac: 3 }));
        chatCompletion.mockResolvedValue({ success: false });
        const { buoi } = await S.taoBuoi('u1', {}, NGAY1);
        expect(buoi.cau.filter((c) => c.dang !== 'dung-sai').map((c) => c.dang)).toEqual(['sua-loi']);
    });

    test('trả lời: chấm ở server, cập nhật nấc; trả lời lại cùng câu → 409', async () => {
        mockLoi.push(LOI({ nac: 1 }));
        await S.taoBuoi('u1', {}, NGAY1);
        const i = mockBuoi.doc.cau.findIndex((c) => c.dang === 'sua-loi');
        const r = await S.traLoi('u1', 'b1', i, { sua: 'i went.' }, NGAY1);
        expect(r.dung).toBe(true);
        expect(r.trangThai.nac).toBe(2);
        expect(mockLoi[0].nac).toBe(2);
        expect((await S.traLoi('u1', 'b1', i, { sua: 'I went' }, NGAY1)).ma).toBe(409);
    });

    test('câu thêm "Đúng hay sai" không đổi nấc', async () => {
        mockLoi.push(LOI({ nac: 1 }));
        await S.taoBuoi('u1', {}, NGAY1);
        const i = mockBuoi.doc.cau.findIndex((c) => c.dang === 'dung-sai');
        const r = await S.traLoi('u1', 'b1', i, { coLoi: mockBuoi.doc.cau[i].dapAn.coLoi }, NGAY1);
        expect(r.dung).toBe(true);
        expect(r.trangThai).toBeNull();
        expect(mockLoi[0].nac).toBe(1);
    });

    test('chưa có lỗi nào → không mở buổi', async () => {
        expect(await S.taoBuoi('u1', {}, NGAY1)).toEqual({ buoi: null });
    });
});
