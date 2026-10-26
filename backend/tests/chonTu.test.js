/**
 * Chọn từ dùng chung cho các chế độ AI (Hội thoại, Nghe, Đọc, Dịch).
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Kho tiếng Trung: đọc `en` (rỗng / phiên âm) thay vì `zh` → AI nhận danh sách rỗng.
 *   2. Bỏ qua bộ lọc mức độ → chọn "Dễ" mà vẫn gặp từ C1.
 *   3. Từ sai đã THUỘC (mastered) vẫn được ưu tiên như từ đang yếu.
 *   4. Tỉ lệ từ sai không tôn trọng / không đủ số từ khi một nhóm thiếu.
 *   5. Đọc và Dịch còn nhận danh sách từ do client gửi (client từng gửi sai trường).
 */
let mockShared = [];
let mockMine = [];
let mockSai = [];
const goi = [];
jest.mock('../models/Vocabulary', () => ({
    find: (q) => { goi.push(['Vocabulary', q]); return { select: () => ({ lean: async () => mockShared }) }; },
}));
jest.mock('../models/VocabularyZh', () => ({
    find: (q) => { goi.push(['VocabularyZh', q]); return { select: () => ({ lean: async () => mockShared }) }; },
}));
jest.mock('../models/UserUpload', () => ({
    find: (q) => { goi.push(['UserUpload', q]); return { select: () => ({ lean: async () => mockMine }) }; },
}));
jest.mock('../models/WrongWord', () => ({
    find: (q) => { goi.push(['WrongWord', q]); return { select: () => ({ lean: async () => mockSai }) }; },
}));

const { chonTu, chonTrongDanhSach, faceOf } = require('../services/chonTu');
const { readFileSync } = require('fs');
const { join } = require('path');

const ST = { selectedSource: 'Hobbies', selectedPart: 'Part 1' };

beforeEach(() => {
    goi.length = 0;
    mockShared = [];
    mockMine = [];
    mockSai = [];
});

describe('mặt từ và bộ từ', () => {
    test('kho tiếng Trung đọc `zh` (không phải `en` rỗng / phiên âm)', async () => {
        mockShared = [{ zh: '你好', en: '' }, { zh: '谢谢', en: 'xièxie' }, { zh: '再见', en: '' }];
        const r = await chonTu({ userId: 'u1', email: 'a@b.c', settings: ST, lang: 'zh', soLuong: 6 });
        expect(r.tu.sort()).toEqual(['你好', '再见', '谢谢'].sort());
        expect(goi.find(([m]) => m === 'VocabularyZh')).toBeTruthy();
        expect(faceOf({ zh: '谢谢', en: 'xièxie' })).toBe('谢谢');
    });

    test('gồm từ vựng riêng (theo email), khử trùng, giữ NGUYÊN chữ hoa của tên đề', async () => {
        mockShared = [{ en: 'hobby', level: 'A1' }, { en: 'leisure', level: 'B2' }];
        mockMine = [{ en: 'hobby', level: 'A1' }, { en: 'knitting', level: 'A2' }];
        const r = await chonTu({ userId: 'u1', email: 'a@b.c', settings: ST, lang: 'en', soLuong: 10 });
        expect(r.tongTrongBo).toBe(3);
        expect(goi.find(([m]) => m === 'Vocabulary')[1]).toEqual({ source: 'Hobbies', part: 'Part 1' });
        expect(goi.find(([m]) => m === 'UserUpload')[1]).toMatchObject({ ownerEmail: 'a@b.c', lang: 'en' });
    });

    test('tôn trọng bộ lọc mức độ', async () => {
        mockShared = [{ en: 'hobby', level: 'A1' }, { en: 'leisure', level: 'B2' }];
        const r = await chonTu({ userId: 'u1', settings: { ...ST, levelFilter: ['A1'] }, lang: 'en', soLuong: 6 });
        expect(r.tu).toEqual(['hobby']);
    });

    test('chưa chọn đề → không truy vấn, báo lỗi để chế độ tự xử lý', async () => {
        const r = await chonTu({ userId: 'u1', settings: {}, lang: 'en', soLuong: 6 });
        expect(r).toEqual({ tu: [], tongTrongBo: 0, loi: 'chua-chon-de' });
        expect(goi).toHaveLength(0);
    });
});

describe('ưu tiên từ đang sai', () => {
    const MAT = Array.from({ length: 20 }, (_, i) => `w${i}`);

    test('chỉ tính từ sai CÒN active (đã thuộc thì thôi ưu tiên)', async () => {
        await chonTrongDanhSach({ userId: 'u1', mat: MAT, soLuong: 6 });
        expect(goi.find(([m]) => m === 'WrongWord')[1]).toEqual({ userId: 'u1', status: 'active' });
    });

    test('tỉ lệ 0.5: tối đa một nửa là từ sai, đủ số lượng', async () => {
        mockSai = MAT.slice(0, 10).map((en) => ({ en }));
        const r = await chonTrongDanhSach({ userId: 'u1', mat: MAT, soLuong: 6, tiLeYeu: 0.5 });
        expect(r).toHaveLength(6);
        expect(r.filter((w) => Number(w.slice(1)) < 10)).toHaveLength(3);
    });

    test('tỉ lệ 1 (Hội thoại): mọi từ sai đứng trước', async () => {
        mockSai = ['w3', 'w7'].map((en) => ({ en }));
        const r = await chonTrongDanhSach({ userId: 'u1', mat: MAT, soLuong: 12, tiLeYeu: 1 });
        expect(r.slice(0, 2).sort()).toEqual(['w3', 'w7']);
        expect(r).toHaveLength(12);
    });

    test('từ thường không đủ → bù bằng từ sai còn lại', async () => {
        const mat = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        mockSai = ['a', 'b', 'c', 'd', 'e', 'f'].map((en) => ({ en }));
        const r = await chonTrongDanhSach({ userId: 'u1', mat, soLuong: 4, tiLeYeu: 0.5 });
        expect(r).toHaveLength(4);
        expect(r).toContain('g');
    });

    test('bộ từ ít hơn số cần → lấy hết, không đọc WrongWord', async () => {
        const r = await chonTrongDanhSach({ userId: 'u1', mat: ['a', 'b'], soLuong: 6 });
        expect(r.sort()).toEqual(['a', 'b']);
        expect(goi).toHaveLength(0);
    });
});

test('Đọc và Dịch chọn từ ở SERVER, không còn nhận từ client', () => {
    for (const f of ['readingController.js', 'translationController.js']) {
        const src = readFileSync(join(__dirname, '..', 'controllers', f), 'utf8');
        expect(src).toMatch(/const \{ tu: words \} = await chonTu\(\{/);
        expect(src).not.toMatch(/req\.body\.words\) \? req\.body\.words/);
    }
});
