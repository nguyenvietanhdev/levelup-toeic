/**
 * "Tiến bộ của tôi": hồ sơ năng lực theo tuần, tính từ dữ liệu đã có.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Tuần chia theo giờ UTC → bài làm lúc 6h sáng giờ VN rơi sang tuần trước.
 *   2. Nói "tiến bộ" / "đi xuống" khi một nửa chỉ có 1 lượt → nhiễu điểm AI thành kết luận.
 *   3. Lỗi ngữ pháp so TỔNG số thay vì lỗi/bài → viết nhiều bài hơn bị báo là "lỗi tăng".
 *   4. Nhóm lỗi "Khác" hoặc lỗi mới gặp 1–2 lần bị coi là điểm yếu.
 *   5. Trộn bài tiếng Trung vào hồ sơ tiếng Anh.
 */
const mockFind = {};
const goi = [];
const mo = (ten) => ({
    find: (q) => {
        goi.push([ten, q]);
        return { select: () => ({ lean: async () => mockFind[ten] || [] }) };
    },
});
jest.mock('../models/PracticeSession', () => mo('PracticeSession'));
jest.mock('../models/Conversation', () => mo('Conversation'));
jest.mock('../models/ListeningSession', () => mo('ListeningSession'));
jest.mock('../models/ReadingAttempt', () => mo('ReadingAttempt'));
jest.mock('../models/Essay', () => mo('Essay'));
jest.mock('../models/Translation', () => mo('Translation'));
jest.mock('../models/WrongWord', () => ({
    countDocuments: async (q) => (q.status === 'mastered' ? (q.updatedAt ? 2 : 10) : (q.nextReviewDate ? 4 : 30)),
    langFilter: () => ({}),
}));
let mockLang = 'en';
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { vocabLang: mockLang } }) }) }),
}));

const { layTienBo, dungTienBo, tuanCua, xuHuong, SO_TUAN } = require('../services/tienBo');
const { homNayVN } = require('../services/loTrinh');

const NOW = new Date('2026-10-25T05:00:00Z');
const { soNgay } = homNayVN(NOW);
/** Mốc `n` ngày trước (giữa trưa giờ VN). */
const truoc = (n) => new Date(NOW.getTime() - n * 86400000);

beforeEach(() => {
    goi.length = 0;
    mockLang = 'en';
    for (const k of Object.keys(mockFind)) delete mockFind[k];
});

describe('chia tuần theo giờ Việt Nam', () => {
    test('hôm nay và 6 ngày trước ở tuần cuối; 7 ngày trước sang tuần trước', () => {
        expect(tuanCua(NOW, soNgay)).toBe(SO_TUAN - 1);
        expect(tuanCua(truoc(6), soNgay)).toBe(SO_TUAN - 1);
        expect(tuanCua(truoc(7), soNgay)).toBe(SO_TUAN - 2);
    });

    test('6h sáng giờ VN (23h UTC hôm trước) tính là cùng ngày giờ VN', () => {
        const n = homNayVN(new Date('2026-10-25T10:00:00Z')).soNgay;
        expect(tuanCua(new Date('2026-10-18T23:00:00Z'), n)).toBe(SO_TUAN - 1); // = 06h 19/10 VN
        expect(tuanCua(new Date('2026-10-18T16:00:00Z'), n)).toBe(SO_TUAN - 2); // = 23h 18/10 VN
    });

    test('ngoài 8 tuần hoặc ở tương lai → -1', () => {
        expect(tuanCua(truoc(SO_TUAN * 7), soNgay)).toBe(-1);
        expect(tuanCua(new Date(NOW.getTime() + 3 * 86400000), soNgay)).toBe(-1);
        expect(tuanCua(null, soNgay)).toBe(-1);
    });
});

describe('xu hướng chỉ kết luận khi đủ dữ liệu', () => {
    test('mỗi nửa cần ≥2 lượt', () => {
        expect(xuHuong({ gt: 50, n: 1 }, { gt: 90, n: 5 }, 5)).toBeNull();
        expect(xuHuong({ gt: 50, n: 2 }, { gt: 90, n: 2 }, 5)).toBe('len');
    });

    test('chênh dưới ngưỡng là ngang; thiếu một nửa là null (không phải "không tiến bộ")', () => {
        expect(xuHuong({ gt: 70, n: 3 }, { gt: 73, n: 3 }, 5)).toBe('ngang');
        expect(xuHuong({ gt: 6, n: 3 }, { gt: 5.4, n: 3 }, 0.5)).toBe('xuong');
        expect(xuHuong({ gt: null, n: 0 }, { gt: 80, n: 4 }, 5)).toBeNull();
    });
});

describe('dựng hồ sơ', () => {
    test('tỉ lệ đúng theo tuần = tổng câu đúng / tổng câu (lượt dài nặng hơn)', () => {
        const r = dungTienBo({
            luyenTu: [
                { at: truoc(1), tu: 18, mau: 20 },
                { at: truoc(2), tu: 0, mau: 5 },
            ],
        }, { soNgay });
        const tv = r.kyNang.find((k) => k.key === 'tu-vung');
        expect(tv.diem[SO_TUAN - 1]).toBe(72); // 18/25, không phải (90% + 0%)/2
        expect(tv.diem[0]).toBeNull();
        expect(tv.soLuot).toBe(2);
    });

    test('đủ 6 kỹ năng, nhãn 8 tuần; nói/viết/dịch theo thang 0–9', () => {
        const r = dungTienBo({ viet: [{ at: truoc(1), overall: 6.5, loi: [] }] }, { soNgay });
        expect(r.kyNang.map((k) => k.key)).toEqual(['tu-vung', 'nghe', 'doc', 'noi', 'viet', 'dich']);
        expect(r.tuan).toHaveLength(SO_TUAN);
        expect(r.tuan[SO_TUAN - 1]).toBe('19/10');
        expect(r.kyNang.find((k) => k.key === 'viet').ganDay).toBe(6.5);
    });

    test('đọc hiểu tiến bộ → có trong nhận xét tốt', () => {
        const doc = [
            { at: truoc(50), tu: 2, mau: 4 }, { at: truoc(45), tu: 2, mau: 4 },
            { at: truoc(5), tu: 4, mau: 4 }, { at: truoc(3), tu: 3, mau: 4 },
        ];
        const r = dungTienBo({ doc }, { soNgay });
        const d = r.kyNang.find((k) => k.key === 'doc');
        expect([d.truoc, d.ganDay, d.xuHuong]).toEqual([50, 88, 'len']);
        expect(r.nhanXet.tot.join('|')).toMatch(/Đọc hiểu tiến bộ: 50% → 88%/);
    });

    test('lỗi ngữ pháp tính theo LỖI/BÀI: viết nhiều bài hơn mà tỉ lệ giảm là tiến bộ', () => {
        const t = (n) => Array.from({ length: n }, () => ({ type: 'tense' }));
        const viet = [
            // 4 tuần trước: 2 bài, 6 lỗi thì → 3 lỗi/bài
            { at: truoc(40), overall: 6, loi: t(3) }, { at: truoc(35), overall: 6, loi: t(3) },
            // 4 tuần gần đây: 4 bài, 4 lỗi thì (tổng nhỏ hơn, nhưng quan trọng là tỉ lệ) → 1 lỗi/bài
            ...[1, 2, 3, 4].map((n) => ({ at: truoc(n), overall: 6, loi: t(1) })),
        ];
        const g = dungTienBo({ viet }, { soNgay }).nguPhap[0];
        expect(g).toMatchObject({ key: 'tense', count: 10, truoc: 3, ganDay: 1, xuHuong: 'giam' });
    });

    test('bỏ nhóm "Khác" và nhóm dưới 3 lần', () => {
        const viet = [{
            at: truoc(1), overall: 6,
            loi: [{ type: 'other' }, { type: 'other' }, { type: 'other' }, { type: 'article' }, { type: 'article' },
                { type: 'preposition' }, { type: 'preposition' }, { type: 'preposition' }],
        }];
        expect(dungTienBo({ viet }, { soNgay }).nguPhap.map((g) => g.key)).toEqual(['preposition']);
    });

    test('Dịch lưu lỗi ở `loai`, cũng được đếm', () => {
        const dich = [{ at: truoc(1), overall: 6, loi: [{ loai: 'article' }, { loai: 'article' }, { loai: 'article' }] }];
        expect(dungTienBo({ dich }, { soNgay }).nguPhap[0].key).toBe('article');
    });

    test('tiêu chí Nói: trung bình theo nhãn ở hai nửa', () => {
        const noi = [
            { at: truoc(40), overall: 5, criteria: [{ label: 'Lưu loát', score: 4 }] },
            { at: truoc(2), overall: 6, criteria: [{ label: 'Lưu loát', score: 6 }, { label: 'Từ vựng', score: null }] },
        ];
        expect(dungTienBo({ noi }, { soNgay }).tieuChiNoi).toEqual([
            { label: 'Lưu loát', truoc: 4, ganDay: 6, soLuot: 2 },
        ]);
    });

    test('điểm yếu: tối đa 3, từ lỗi ngữ pháp và kỹ năng % dưới 70', () => {
        const art = Array.from({ length: 3 }, () => ({ type: 'article' }));
        const r = dungTienBo({
            viet: [{ at: truoc(1), overall: 6, loi: art }],
            nghe: [{ at: truoc(1), tu: 40, mau: 100 }],
        }, { soNgay });
        expect(r.diemYeu).toEqual([
            { loai: 'ngu-phap', key: 'article', vi: 'Mạo từ (a/an/the)' },
            { loai: 'ky-nang', key: 'nghe', vi: 'Nghe' },
        ]);
    });

    test('chưa có gì → coDuLieu false, không bịa nhận xét', () => {
        const r = dungTienBo({}, { soNgay });
        expect(r.coDuLieu).toBe(false);
        expect(r.nhanXet).toEqual({ tot: [], canLuyen: [] });
    });
});

describe('đọc từ DB', () => {
    test('gom đủ nguồn, phiên hội thoại chỉ lấy cái đã chấm, từ vựng đếm theo trạng thái', async () => {
        mockFind.PracticeSession = [{ completedAt: truoc(1), questionsCount: 10, correctAnswers: 8 }];
        mockFind.Conversation = [
            { updatedAt: truoc(1), feedback: { overall: 6, criteria: [] } },
            { updatedAt: truoc(1), feedback: {} }, // chấm lỗi → bỏ
        ];
        const r = await layTienBo('u1', NOW);
        expect(r.kyNang.find((k) => k.key === 'tu-vung').ganDay).toBe(80);
        expect(r.kyNang.find((k) => k.key === 'noi').soLuot).toBe(1);
        expect(r.tuVung).toEqual({ dangOn: 30, denHan: 4, daThuoc: 10, moiThuoc: 2 });
        const conv = goi.find(([t]) => t === 'Conversation')[1];
        expect(conv).toMatchObject({ status: 'done', feedback: { $ne: null } });
    });

    test('lọc theo ngôn ngữ đang học (bài cũ không có lang tính là tiếng Anh)', async () => {
        await layTienBo('u1', NOW);
        expect(goi.find(([t]) => t === 'Essay')[1].lang).toEqual({ $ne: 'zh' });
        mockLang = 'zh';
        goi.length = 0;
        await layTienBo('u1', NOW);
        expect(goi.find(([t]) => t === 'Essay')[1].lang).toBe('zh');
        // Lượt luyện từ không lưu ngôn ngữ — không lọc.
        expect(goi.find(([t]) => t === 'PracticeSession')[1].lang).toBeUndefined();
    });

    test('chỉ lấy 8 tuần: mốc bắt đầu là 00:00 giờ VN của ngày đầu tuần cũ nhất', async () => {
        await layTienBo('u1', NOW);
        const q = goi.find(([t]) => t === 'Essay')[1];
        expect(q.createdAt.$gte.toISOString()).toBe('2026-08-30T17:00:00.000Z'); // 00:00 31/08 VN
    });
});
