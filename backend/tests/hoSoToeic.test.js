/**
 * Mục tiêu TOEIC: trình độ theo Part đọc từ bài đã làm.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Chọn Part có tỉ lệ thấp nhất thay vì mất nhiều câu nhất → luyện chỗ ít lợi.
 *   2. Một hai câu đã kết luận về cả Part.
 *   3. Lệch số với thẻ dự đoán điểm.
 *   4. Đặt điểm mục tiêu không hợp lệ.
 */
const mockAttempts = { ds: [] };
jest.mock('../models/ToeicAttempt', () => ({
    find: jest.fn(() => {
        const chuoi = { lean: async () => mockAttempts.ds };
        chuoi.sort = () => chuoi;
        chuoi.limit = () => chuoi;
        chuoi.select = () => chuoi;
        return chuoi;
    }),
}));
const mockProfile = { diem: 0 };
jest.mock('../models/UserProfile', () => ({
    findOne: () => ({ select: () => ({ lean: async () => ({ settings: { toeicTargetScore: mockProfile.diem } }) }) }),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
}));
jest.mock('../models/HoSoHocVien', () => ({
    findOne: jest.fn(() => ({ lean: async () => ({ mucTieu: 'toeic', kyNang: {} }) })),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
}));

const UserProfile = require('../models/UserProfile');
const HoSoHocVien = require('../models/HoSoHocVien');
const T = require('../services/hoSoToeic');
const HS = require('../services/hoSoHoc');
const { predictToeicScore } = require('../services/toeicPrediction');

/** Một bài có đúng `dung`/`tong` câu ở Part `n`. */
const bai = (ds) => ({
    testType: 'mini',
    partScores: ds.map(([partNumber, correctAnswers, totalQuestions]) => ({ partNumber, correctAnswers, totalQuestions })),
});
const DU_BAY_PART = [[1, 5, 6], [2, 20, 25], [3, 30, 39], [4, 24, 30], [5, 24, 30], [6, 14, 16], [7, 38, 54]];

beforeEach(() => {
    mockAttempts.ds = [];
    mockProfile.diem = 0;
    UserProfile.updateOne.mockClear();
    HoSoHocVien.updateOne.mockClear();
});

describe('tóm tắt từng Part', () => {
    test('đủ 7 Part; dưới 5 câu thì chưa đủ dữ liệu, không ra phần trăm', () => {
        const p = T.tomTatPart([bai([[5, 2, 3]])]);
        expect(p).toHaveLength(7);
        expect(p.find((x) => x.part === 5)).toMatchObject({ duDuLieu: false, doChinhXac: null });
    });
    test('đủ dữ liệu: có tỉ lệ đúng và số câu mất quy trên đề chuẩn', () => {
        const p = T.tomTatPart([bai([[7, 27, 54]])]).find((x) => x.part === 7);
        expect(p).toMatchObject({ duDuLieu: true, doChinhXac: 50, cauMat: 27, soCauChuan: 54 });
    });
});

describe('chọn trọng tâm', () => {
    test('còn Part chưa đo: làm Part đó trước, ưu tiên Part ngắn', () => {
        const r = T.chonPartTrongTam(T.tomTatPart([]));
        expect(r.part).toBe(5);
        expect(r.lyDo).toContain('Chưa đủ dữ liệu');
    });
    test('đủ dữ liệu: chọn Part mất nhiều câu nhất, không phải tỉ lệ thấp nhất', () => {
        const ds = DU_BAY_PART.map((x) => (x[0] === 1 ? [1, 3, 6] : x));
        const r = T.chonPartTrongTam(T.tomTatPart([bai(ds)]));
        expect(r.part).toBe(7);
        expect(r.lyDo).toContain('mất nhiều câu nhất');
    });
    test('Part 5, 6 gợi ý mở ngữ pháp; Part nghe thì không', () => {
        const t = (n) => T.chonPartTrongTam([{ part: n, ...T.PART[n], duDuLieu: false }]);
        expect(t(5).canNguPhap).toBe(true);
        expect(t(6).canNguPhap).toBe(true);
        expect(t(2).canNguPhap).toBe(false);
    });
});

describe('kỹ năng yếu hơn', () => {
    test('so tỉ lệ câu mất giữa Nghe và Đọc', () => {
        expect(T.kyNangYeuHon(T.tomTatPart([bai([[2, 5, 25], [5, 28, 30]])]))).toBe('nghe');
        expect(T.kyNangYeuHon(T.tomTatPart([bai([[2, 24, 25], [5, 10, 30]])]))).toBe('doc');
    });
    test('thiếu dữ liệu một bên thì không so', () => {
        expect(T.kyNangYeuHon(T.tomTatPart([bai([[2, 5, 25]])]))).toBeNull();
    });
});

describe('hồ sơ', () => {
    test('chưa làm bài: vẫn có trọng tâm để bắt đầu, không có dự đoán', async () => {
        const r = await T.layHoSoToeic('u1');
        expect(r).toMatchObject({ soBai: 0, duDoan: null, kyYeu: null });
        expect(r.trongTam.part).toBe(5);
    });
    test('dự đoán khớp đúng hàm của thẻ dự đoán điểm, có khoảng cách tới mục tiêu', async () => {
        mockAttempts.ds = [bai(DU_BAY_PART)];
        mockProfile.diem = 750;
        const r = await T.layHoSoToeic('u1');
        expect(r.duDoan).toEqual(predictToeicScore(mockAttempts.ds, 750));
        expect(r.diemMucTieu).toBe(750);
    });
});

describe('đặt mục tiêu', () => {
    test('nhận Giao tiếp và TOEIC; chưa nhận IELTS, HSK', async () => {
        expect(await HS.datMucTieu('u1', 'toeic')).toBe(true);
        expect(await HS.datMucTieu('u1', 'giao-tiep')).toBe(true);
        expect(await HS.datMucTieu('u1', 'ielts')).toBe(false);
        expect(await HS.datMucTieu('u1', 'hsk')).toBe(false);
    });
    test('điểm mục tiêu hợp lệ được lưu vào cài đặt có sẵn', async () => {
        await HS.datMucTieu('u1', 'toeic', { diemMucTieu: 750 });
        expect(UserProfile.updateOne.mock.calls[0][1].$set).toEqual({ 'settings.toeicTargetScore': 750 });
    });
    test.each([[1000], [-5], [753], ['abc']])('điểm %s không hợp lệ: bỏ qua, không lưu', async (diem) => {
        await HS.datMucTieu('u1', 'toeic', { diemMucTieu: diem });
        expect(UserProfile.updateOne).not.toHaveBeenCalled();
    });
    test('hồ sơ có phần TOEIC khi đang theo mục tiêu đó', async () => {
        const r = await HS.layHoSo('u1');
        expect(r.mucTieu).toBe('toeic');
        expect(r.toeic.parts).toHaveLength(7);
    });
});
