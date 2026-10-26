/**
 * Lộ trình hôm nay: các bước và bước nào đã xong, tính từ dữ liệu đã có.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. "Hôm nay" theo giờ UTC → học lúc 6h sáng giờ Việt Nam bị tính sang hôm qua.
 *   2. Không có từ nào đến hạn mà bước Ôn sai vẫn "chưa xong" → không bao giờ đủ 6/6.
 *   3. Đếm phiên hội thoại / nghe CHƯA chấm là đã xong.
 */
const mockCount = {};
const goi = [];
const mo = (ten) => ({
    countDocuments: async (q) => { goi.push([ten, q]); return mockCount[ten] ?? 0; },
});
jest.mock('../models/PracticeSession', () => ({
    countDocuments: async (q) => {
        goi.push(['PracticeSession', q]);
        return q.mode === 'review-mistakes' ? (mockCount.onSai ?? 0) : (mockCount.hocTu ?? 0);
    },
}));
jest.mock('../models/Conversation', () => mo('Conversation'));
jest.mock('../models/ListeningSession', () => mo('ListeningSession'));
jest.mock('../models/ReadingAttempt', () => mo('ReadingAttempt'));
jest.mock('../models/Essay', () => mo('Essay'));
jest.mock('../models/Translation', () => mo('Translation'));
jest.mock('../models/WrongWord', () => ({ ...mo('WrongWord'), langFilter: () => ({}) }));
jest.mock('../models/LoiOn', () => mo('LoiOn'));
jest.mock('../models/BuoiOnLoi', () => mo('BuoiOnLoi'));
let mockKeHoach = null;
jest.mock('../models/TongKetTuan', () => ({
    findOne: (q) => { goi.push(['TongKetTuan', q]); return { select: () => ({ lean: async () => mockKeHoach }) }; },
}));
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { vocabLang: 'en' } }) }) }),
}));

const { layLoTrinh, dungLoTrinh, homNayVN, vietHayDich, dauTuanVN } = require('../services/loTrinh');

beforeEach(() => {
    goi.length = 0;
    for (const k of Object.keys(mockCount)) delete mockCount[k];
});

describe('"hôm nay" theo giờ Việt Nam', () => {
    test('6h sáng giờ VN (23h UTC hôm trước) vẫn là hôm nay', () => {
        const r = homNayVN(new Date('2026-10-24T23:00:00Z'));
        expect(r.ngay).toBe('2026-10-25');
        expect(r.dau.toISOString()).toBe('2026-10-24T17:00:00.000Z');
    });

    test('23h59 giờ VN chưa sang ngày mới', () => {
        expect(homNayVN(new Date('2026-10-25T16:59:00Z')).ngay).toBe('2026-10-25');
        expect(homNayVN(new Date('2026-10-25T17:00:00Z')).ngay).toBe('2026-10-26');
    });

    test('Viết và Dịch đổi xen kẽ theo ngày', () => {
        const a = homNayVN(new Date('2026-10-25T05:00:00Z')).soNgay;
        expect(vietHayDich(a)).not.toBe(vietHayDich(a + 1));
    });
});

describe('dựng lộ trình', () => {
    const DEM = { onSai: 0, hocTu: 0, nghe: 0, doc: 0, noi: 0, viet: 0, dich: 0, tuDenHan: 5 };

    test('sáu bước theo đúng thứ tự tiếp nhận → tạo ra', () => {
        const r = dungLoTrinh(DEM, { ngay: 'x', soNgay: 1 });
        expect(r.buoc.map((b) => b.key)).toEqual(['on-sai', 'hoc-tu', 'nghe', 'doc', 'noi', 'viet-dich']);
        expect(r).toMatchObject({ soXong: 0, tong: 6 });
    });

    test('không có từ đến hạn → Ôn sai tính là xong (bỏ qua)', () => {
        const r = dungLoTrinh({ ...DEM, tuDenHan: 0 }, { ngay: 'x', soNgay: 1 });
        expect(r.buoc[0]).toMatchObject({ xong: true, boQua: true });
    });

    test('Viết HOẶC Dịch đều tính cho bước 6; gợi ý theo ngày', () => {
        const r = dungLoTrinh({ ...DEM, dich: 1 }, { ngay: 'x', soNgay: 2 });
        expect(r.buoc[5]).toMatchObject({ xong: true, soLan: 1, goiY: 'viet' });
    });
});

describe('đếm từ dữ liệu đã có', () => {
    test('chỉ tính phiên ĐÃ CHẤM (hội thoại, nghe) và từ mốc 00:00 giờ VN', async () => {
        mockCount.Conversation = 1;
        mockCount.hocTu = 2;
        const r = await layLoTrinh('u1', new Date('2026-10-25T03:00:00Z'));
        expect(r.buoc.find((b) => b.key === 'noi')).toMatchObject({ xong: true, soLan: 1 });
        expect(r.buoc.find((b) => b.key === 'hoc-tu').soLan).toBe(2);

        const conv = goi.find(([t]) => t === 'Conversation')[1];
        expect(conv).toMatchObject({ userId: 'u1', status: 'done' });
        expect(conv.updatedAt.$gte.toISOString()).toBe('2026-10-24T17:00:00.000Z');
        expect(goi.find(([t]) => t === 'ListeningSession')[1]).toMatchObject({ status: 'done' });
        // Ôn sai và Học từ tách nhau theo mode.
        const ps = goi.filter(([t]) => t === 'PracticeSession').map(([, q]) => q.mode);
        expect(ps).toEqual(['review-mistakes', { $ne: 'review-mistakes' }]);
    });

    test('route đăng ký sau đăng nhập', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        expect(readFileSync(join(__dirname, '..', 'server.js'), 'utf8'))
            .toMatch(/app\.use\('\/api\/lo-trinh', require\('\.\/routes\/loTrinh'\)\)/);
        expect(readFileSync(join(__dirname, '..', 'routes', 'loTrinh.js'), 'utf8')).toMatch(/router\.use\(protect\)/);
    });
});

describe('kế hoạch tuần từ Tổng kết tuần', () => {
    test('tuần bắt đầu thứ Hai giờ VN', () => {
        expect(dauTuanVN(new Date('2026-10-25T05:00:00Z'))).toBe('2026-10-19'); // CN 25/10 → T2 19/10
        expect(dauTuanVN(new Date('2026-10-25T17:30:00Z'))).toBe('2026-10-26'); // 00:30 T2 26/10 VN
    });

    test('có tổng kết tuần này → trả keHoachTuan; chưa có → []', async () => {
        mockKeHoach = { keHoach: [{ viec: 'Nghe 3 bài', buoc: 'nghe' }] };
        const r = await layLoTrinh('u1', new Date('2026-10-25T05:00:00Z'));
        expect(r.keHoachTuan).toEqual([{ viec: 'Nghe 3 bài', buoc: 'nghe' }]);
        expect(goi.find(([t]) => t === 'TongKetTuan')[1]).toMatchObject({ tuan: '2026-10-19', lang: 'en' });
        mockKeHoach = null;
        expect((await layLoTrinh('u1')).keHoachTuan).toEqual([]);
    });
});

describe('bước Ôn sai gộp ôn từ và ôn lỗi', () => {
    const D = { onSai: 0, hocTu: 0, nghe: 0, doc: 0, noi: 0, viet: 0, dich: 0, tuDenHan: 0 };
    test('chỉ có LỖI đến hạn → chưa xong, không bỏ qua; ôn lỗi một buổi → xong', () => {
        const a = dungLoTrinh({ ...D, loiDenHan: 3 }, { ngay: 'x', soNgay: 1 }).buoc[0];
        expect(a).toMatchObject({ xong: false, boQua: false, loiDenHan: 3 });
        const b = dungLoTrinh({ ...D, loiDenHan: 3, onLoi: 1 }, { ngay: 'x', soNgay: 1 }).buoc[0];
        expect(b).toMatchObject({ xong: true, soLan: 1 });
    });

    test('đọc từ DB: đếm lỗi đến hạn và buổi ôn lỗi đã trả lời hôm nay', async () => {
        mockCount.LoiOn = 2;
        mockCount.BuoiOnLoi = 1;
        const r = await layLoTrinh('u1', new Date('2026-10-25T05:00:00Z'));
        expect(r.buoc[0]).toMatchObject({ loiDenHan: 2, soLan: 1, xong: true });
        expect(goi.find(([t]) => t === 'BuoiOnLoi')[1]).toMatchObject({ 'cau.daTra': true });
    });
});
