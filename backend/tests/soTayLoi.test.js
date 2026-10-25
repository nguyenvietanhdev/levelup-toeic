/**
 * Sổ tay lỗi: gom lỗi đã chữa trong Viết và Dịch, kèm cách sửa.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Viết lưu cụm sửa ở `fix`, Dịch ở `better` — đọc một tên là mất nửa sổ tay.
 *   2. Bài cũ (chấm trước khi có mức độ) không có `muc` → bị bỏ hoặc ra undefined.
 *   3. Trộn lỗi bài tiếng Trung vào sổ tay tiếng Anh.
 */
const mockFind = {};
const goi = [];
const mo = (ten) => ({
    find: (q) => { goi.push([ten, q]); return { select: () => ({ lean: async () => mockFind[ten] || [] }) }; },
});
jest.mock('../models/Essay', () => mo('Essay'));
jest.mock('../models/Translation', () => mo('Translation'));
let mockLang = 'en';
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { vocabLang: mockLang } }) }) }),
}));

const { laySoTay, dungSoTay } = require('../services/soTayLoi');

const VIET = [{
    _id: 'e1', createdAt: new Date('2026-10-20'),
    issues: [
        { quote: 'I goes', issue: 'Sai hoà hợp', fix: 'I go', type: 'agreement', muc: 'loi' },
        { quote: 'very big', issue: 'Chưa tự nhiên', fix: 'huge', type: 'word-choice', muc: 'nen' },
    ],
}];
const DICH = [{
    _id: 't1', createdAt: new Date('2026-10-22'),
    notes: [
        { quote: 'a apple', issue: 'Sai mạo từ', better: 'an apple', loai: 'article' }, // bài cũ: không có muc
        { quote: '', issue: 'Nhận xét chung', better: '' }, // không có gì để học lại → bỏ
    ],
}];

beforeEach(() => { goi.length = 0; mockLang = 'en'; for (const k of Object.keys(mockFind)) delete mockFind[k]; });

describe('dựng sổ tay', () => {
    test('đọc đúng trường sửa của từng nguồn; mới nhất trước; bỏ mục rỗng', () => {
        const r = dungSoTay({ viet: VIET, dich: DICH });
        expect(r.tong).toBe(3);
        expect(r.muc.map((m) => [m.nguon, m.quote, m.sua])).toEqual([
            ['dich', 'a apple', 'an apple'],
            ['viet', 'I goes', 'I go'],
            ['viet', 'very big', 'huge'],
        ]);
    });

    test('nhãn tiếng Việt, mức độ; bài cũ thiếu muc → lỗi', () => {
        const r = dungSoTay({ viet: VIET, dich: DICH });
        const apple = r.muc.find((m) => m.quote === 'a apple');
        expect(apple).toMatchObject({ loai: 'article', vi: 'Mạo từ (a/an/the)', muc: 'loi', id: 'dich-t1-0', baiId: 't1' });
        expect(r.muc.find((m) => m.quote === 'very big').muc).toBe('nen');
    });

    test('thống kê nhóm theo loại, nhiều nhất trước', () => {
        const r = dungSoTay({ viet: VIET, dich: DICH });
        expect(r.nhom.map((n) => [n.key, n.count])).toEqual([['article', 1], ['agreement', 1], ['word-choice', 1]]);
    });
});

test('nhóm "Khác" luôn ở cuối, kể cả khi nhiều nhất', () => {
    const khac = Array.from({ length: 5 }, () => ({ quote: 'x', issue: 'y', fix: 'z', type: 'other' }));
    const r = dungSoTay({ viet: [{ _id: 'e9', createdAt: new Date(), issues: [...khac, { quote: 'a', fix: 'b', type: 'tense' }] }] });
    expect(r.nhom.map((n) => n.key)).toEqual(['tense', 'other']);
});

describe('đọc từ DB', () => {
    test('lọc theo ngôn ngữ đang học, 180 ngày', async () => {
        mockFind.Essay = VIET;
        const r = await laySoTay('u1', new Date('2026-10-25T00:00:00Z'));
        expect(r).toMatchObject({ tong: 2, soNgay: 180, lang: 'en' });
        const q = goi.find(([t]) => t === 'Essay')[1];
        expect(q.lang).toEqual({ $ne: 'zh' });
        expect(q.createdAt.$gte.toISOString()).toBe('2026-04-28T00:00:00.000Z');
        mockLang = 'zh';
        goi.length = 0;
        await laySoTay('u1');
        expect(goi.find(([t]) => t === 'Translation')[1].lang).toBe('zh');
    });
});
