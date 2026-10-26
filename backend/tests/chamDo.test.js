/**
 * Chấm đỏ trên menu: chế độ đang dở, lộ trình hôm nay, tổng kết tuần.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Bài nháp của ngôn ngữ khác làm chấm sai chế độ.
 *   2. Phiên Chat dở hiện chấm ở Hội thoại giọng nói (và ngược lại).
 *   3. Người chưa học gì bị nhắc "chưa tổng kết".
 */
const goi = [];
let mockNhap = [];
let mockConvo = { chat: false, giong: false };
let mockDaTongKet = false;
let mockCoDuLieu = true;
let mockLoTrinh = { soXong: 2, tong: 6 };

jest.mock('../models/BaiNhap', () => ({
    find: (q) => { goi.push(['BaiNhap', q]); return { select: () => ({ lean: async () => mockNhap }) }; },
}));
jest.mock('../models/Conversation', () => ({
    exists: async (q) => (q.voice === true ? mockConvo.giong : mockConvo.chat),
}));
jest.mock('../models/PracticeSession', () => ({ exists: async () => mockCoDuLieu }));
jest.mock('../models/TongKetTuan', () => ({ exists: async () => mockDaTongKet }));
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { vocabLang: 'en' } }) }) }),
}));
jest.mock('../services/loTrinh', () => ({
    ...jest.requireActual('../services/loTrinh'),
    layLoTrinh: async () => mockLoTrinh,
}));

const { layChamDo } = require('../services/chamDo');
const NOW = new Date('2026-10-26T05:00:00Z');

beforeEach(() => {
    goi.length = 0;
    mockNhap = [];
    mockConvo = { chat: false, giong: false };
    mockDaTongKet = false;
    mockCoDuLieu = true;
    mockLoTrinh = { soXong: 2, tong: 6 };
});

test('bài nháp theo ngôn ngữ đang học → chấm đúng chế độ', async () => {
    mockNhap = [{ mode: 'nghe' }, { mode: 'viet' }];
    const r = await layChamDo('u1', NOW);
    expect(goi[0][1]).toEqual({ userId: 'u1', lang: 'en' });
    expect(r.dangDo).toMatchObject({ nghe: true, viet: true, doc: false, dich: false });
});

test('Chat và Hội thoại giọng nói tách riêng', async () => {
    mockConvo = { chat: false, giong: true };
    const r = await layChamDo('u1', NOW);
    expect(r.dangDo).toMatchObject({ chat: false, hoiThoai: true });
});

test('lộ trình: chấm khi chưa xong đủ bước; kèm ngày / tuần giờ VN', async () => {
    expect(await layChamDo('u1', NOW)).toMatchObject({ loTrinh: true, ngay: '2026-10-26', tuan: '2026-10-26' });
    mockLoTrinh = { soXong: 6, tong: 6 };
    expect((await layChamDo('u1', NOW)).loTrinh).toBe(false);
});

test('tổng kết: chỉ nhắc khi CHƯA có tổng kết tuần này VÀ đã có dữ liệu', async () => {
    expect((await layChamDo('u1', NOW)).tongKet).toBe(true);
    mockDaTongKet = true;
    expect((await layChamDo('u1', NOW)).tongKet).toBe(false);
    mockDaTongKet = false;
    mockCoDuLieu = false;
    expect((await layChamDo('u1', NOW)).tongKet).toBe(false);
});
