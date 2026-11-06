/**
 * Nối hồ sơ người học với các chế độ AI.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Hồ sơ lọt vào prompt CHẤM → hồ sơ thấp có thể kéo điểm thấp, không còn đo được tiến bộ.
 *      Lời dặn không đảm bảo được, nên bộ chấm tuyệt đối không được thấy hồ sơ.
 *   2. Hồ sơ âm thầm đổi độ khó người học đã chọn.
 *   3. Bài không có câu quá khứ lại được tính là giỏi quá khứ.
 *   4. Lỗi đọc/ghi hồ sơ làm hỏng việc chấm bài đã tốn năng lượng.
 *   5. Viết lại giải thích làm mất hoặc đảo lỗi, hoặc AI lỗi làm mất phần giải thích gốc.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const mockHoSo = { doc: null, loi: false, ghi: [] };
jest.mock('../models/HoSoHocVien', () => ({
    findOne: () => ({
        select: () => ({
            lean: async () => {
                if (mockHoSo.loi) throw new Error('db');
                return mockHoSo.doc;
            },
        }),
    }),
    updateOne: jest.fn(async (q, u) => {
        if (mockHoSo.loi) throw new Error('db');
        mockHoSo.ghi.push(u.$set);
        return { modifiedCount: 1 };
    }),
}));
jest.mock('../models/UserProfile', () => ({}));

const { chatCompletion } = require('../config/openai');
const S = require('../services/phanHoiTheoHoSo');
const { gradeTranslation, generatePassage } = require('../services/translationGrader');
const { gradeEssay, generatePrompt } = require('../services/essayGrader');
const { buildGradingMessages } = require('../services/conversationGrader');

const yeu = { d: 0, s: 4, soLan: 4 };
const vung = { d: 8, s: 0, soLan: 8 };
const HOC_VIEN = { mucTieu: 'giao-tiep', kyNang: { 'qua-khu': yeu, 'khung-cau': vung, nghe: yeu, noi: yeu } };

beforeEach(() => {
    mockHoSo.doc = null;
    mockHoSo.loi = false;
    mockHoSo.ghi = [];
    chatCompletion.mockReset();
});

describe('đọc hồ sơ', () => {
    test('chưa có hồ sơ hoặc hồ sơ trống: không chỉ thị gì', () => {
        expect(S.boiCanh(null)).toBeNull();
        expect(S.boiCanh({ mucTieu: '', kyNang: {} })).toBeNull();
        expect(S.chiThiRaBai(null)).toBe('');
        expect(S.chiThiCham(null)).toBe('');
    });
    test('chỉ lấy kỹ năng yếu có cách tạo cơ hội, tối đa 2', () => {
        const bc = S.boiCanh(HOC_VIEN);
        expect(bc.yeu).toEqual(['qua-khu']); // nghe, nói yếu nhưng không nhắm được bằng nội dung bài
        const nhieu = { mucTieu: '', kyNang: { 'qua-khu': yeu, 'tell-say-talk': yeu, 'mau-giao-tiep': yeu } };
        expect(S.boiCanh(nhieu).yeu).toHaveLength(2);
    });
    test('chỉ mới có mục tiêu: vẫn có bối cảnh, chưa kết luận trình độ', () => {
        const bc = S.boiCanh({ mucTieu: 'toeic', kyNang: {} });
        expect(bc).toMatchObject({ mucTieu: 'toeic', trinhDo: '', yeu: [] });
        expect(S.chiThiCham(bc)).toBe('');
    });
    test('lỗi đọc hồ sơ hoặc học tiếng Trung: trả rỗng, không ném lỗi', async () => {
        mockHoSo.doc = HOC_VIEN;
        expect(await S.layChiThiRaBai('u1', 'zh')).toBe('');
        mockHoSo.loi = true;
        expect(await S.layChiThiRaBai('u1', 'en')).toBe('');
        expect(await S.layChiThiCham('u1', 'en')).toBe('');
    });
});

describe('chỉ thị', () => {
    test('ra bài: theo mục tiêu, tạo cơ hội luyện, giữ nguyên độ khó, không nói với người học', () => {
        const c = S.chiThiRaBai(S.boiCanh(HOC_VIEN));
        expect(c).toContain('everyday situations');
        expect(c).toContain('talking about past events');
        expect(c).toContain('Keep the chosen difficulty level unchanged');
        expect(c).toContain('Never mention');
    });
    test('mục tiêu TOEIC: bối cảnh công sở', () => {
        expect(S.chiThiRaBai({ mucTieu: 'toeic', yeu: [] })).toContain('workplace');
    });
    test('giải thích theo trình độ và điểm yếu', () => {
        const moi = S.chiThiCham({ trinhDo: 'Mới bắt đầu', yeu: ['qua-khu'] });
        expect(moi).toContain('simple Vietnamese');
        expect(moi).toContain('talking about past events');
        expect(S.chiThiCham({ trinhDo: 'Khá', yeu: [] })).toContain('concise');
    });
    test('trình độ trung bình, không có điểm yếu: không thêm token vô ích', () => {
        expect(S.chiThiCham({ trinhDo: 'Cơ bản', yeu: [] })).toBe('');
    });
});

describe('bằng chứng từ bài làm', () => {
    test('có lỗi là bằng chứng sai', () => {
        expect(S.bangChungTuBai({ loi: [{ type: 'tense' }], diemNguPhap: 9 })).toContainEqual({ kyNang: 'qua-khu', dung: false });
        expect(S.bangChungTuBai({ loi: [{ loai: 'literal-translation' }] })).toEqual([{ kyNang: 'khung-cau', dung: false }]);
    });
    test('nhiều lỗi cùng loại trong một bài chỉ tính một lần', () => {
        const r = S.bangChungTuBai({ loi: [{ type: 'tense' }, { type: 'tense' }, { type: 'tense' }] });
        expect(r.filter((x) => x.kyNang === 'qua-khu')).toHaveLength(1);
    });
    test('không lỗi chỉ tính đúng khi điểm ngữ pháp cũng tốt', () => {
        expect(S.bangChungTuBai({ loi: [], diemNguPhap: 8 })).toEqual([
            { kyNang: 'qua-khu', dung: true }, { kyNang: 'khung-cau', dung: true },
        ]);
        expect(S.bangChungTuBai({ loi: [], diemNguPhap: 5 })).toEqual([]);
        expect(S.bangChungTuBai({ loi: [] })).toEqual([]);
    });
    test('góp ý văn phong không phải lỗi', () => {
        expect(S.bangChungTuBai({ loi: [{ type: 'tense', level: 'style' }, { loai: 'tense', muc: 'nen' }] })).toEqual([]);
    });
    test('tell/say/talk: chọn từ sai mà cách sửa là các từ này; chọn từ khác thì không', () => {
        expect(S.bangChungTuBai({ loi: [{ type: 'word-choice', fix: 'She told me' }] }))
            .toContainEqual({ kyNang: 'tell-say-talk', dung: false });
        expect(S.bangChungTuBai({ loi: [{ loai: 'word-choice', better: 'a big house' }] })).toEqual([]);
    });
    test('hội thoại nói: điểm tốt, yếu; điểm giữa và thiếu điểm thì không tính', () => {
        const c = (...d) => ({ criteria: d.map((score) => ({ score })) });
        expect(S.bangChungNoi(c(7, 6))).toEqual([{ kyNang: 'noi', dung: true }]);
        expect(S.bangChungNoi(c(3, 4))).toEqual([{ kyNang: 'noi', dung: false }]);
        expect(S.bangChungNoi(c(5, 5))).toEqual([]);
        expect(S.bangChungNoi(null)).toEqual([]);
    });
    test('nghe: điểm tốt, yếu; điểm giữa thì không tính', () => {
        expect(S.bangChungNghe(80)).toEqual([{ kyNang: 'nghe', dung: true }]);
        expect(S.bangChungNghe(30)).toEqual([{ kyNang: 'nghe', dung: false }]);
        expect(S.bangChungNghe(60)).toEqual([]);
    });
    test('ghi vào hồ sơ; học tiếng Trung thì không; lỗi ghi không ném ra ngoài', async () => {
        await S.ghiBangChung('u1', 'zh', [{ kyNang: 'nghe', dung: true }]);
        expect(mockHoSo.ghi).toHaveLength(0);
        await S.ghiBangChung('u1', 'en', [{ kyNang: 'nghe', dung: true }]);
        expect(Object.keys(mockHoSo.ghi[0])).toEqual(['kyNang.nghe']);
        mockHoSo.loi = true;
        await expect(S.ghiBangChung('u1', 'en', [{ kyNang: 'nghe', dung: true }])).resolves.toBeUndefined();
    });
});

describe('viết lại giải thích', () => {
    const LOI = [{ quote: 'I go', issue: 'gốc 1', fix: 'I went', loai: 'tense' }, { said: 'a', issue: 'gốc 2', better: 'b' }];
    const aiTra = (o) => chatCompletion.mockResolvedValue({ success: true, content: JSON.stringify(o) });

    test('chỉ đổi phần giải thích, giữ nguyên mọi trường khác và thứ tự', async () => {
        aiTra({ issue: ['mới 1', 'mới 2'] });
        const r = await S.vietLaiGiaiThich(LOI, 'chỉ thị', 'u1');
        expect(r).toEqual([{ ...LOI[0], issue: 'mới 1' }, { ...LOI[1], issue: 'mới 2' }]);
    });
    test('AI viết bằng tiếng Anh: giữ bản gốc tiếng Việt của mục đó', async () => {
        aiTra({ issue: ['Wrong tense: use past simple.', 'mới 2'] });
        const r = await S.vietLaiGiaiThich(LOI, 'chỉ thị', 'u1');
        expect(r[0].issue).toBe('gốc 1');
        expect(r[1].issue).toBe('mới 2');
    });
    test('không có chỉ thị hoặc không có lỗi: không gọi AI', async () => {
        expect(await S.vietLaiGiaiThich(LOI, '', 'u1')).toBe(LOI);
        expect(await S.vietLaiGiaiThich([], 'chỉ thị', 'u1')).toEqual([]);
        expect(chatCompletion).not.toHaveBeenCalled();
    });
    test.each([
        ['AI lỗi', { success: false }],
        ['sai JSON', { success: true, content: 'abc' }],
        ['thiếu mục', { success: true, content: '{"issue":["một"]}' }],
    ])('%s: giữ nguyên bản gốc', async (_, tra) => {
        chatCompletion.mockResolvedValue(tra);
        expect(await S.vietLaiGiaiThich(LOI, 'chỉ thị', 'u1')).toEqual(LOI);
    });
    test('mục trả về rỗng: giữ giải thích gốc của mục đó', async () => {
        aiTra({ issue: ['mới 1', ''] });
        const r = await S.vietLaiGiaiThich(LOI, 'chỉ thị', 'u1');
        expect(r[0].issue).toBe('mới 1');
        expect(r[1].issue).toBe('gốc 2');
    });
    test('lỗi vượt trần vẫn còn đủ, chỉ phần đầu được viết lại', async () => {
        const nhieu = Array.from({ length: 10 }, (_, i) => ({ quote: `q${i}`, issue: `g${i}` }));
        aiTra({ issue: Array.from({ length: 8 }, (_, i) => `mới ${i}`) });
        const r = await S.vietLaiGiaiThich(nhieu, 'chỉ thị', 'u1');
        expect(r).toHaveLength(10);
        expect(r[7].issue).toBe('mới 7');
        expect(r[8].issue).toBe('g8');
    });
    test('nội dung người học là dữ liệu, không nằm trong phần chỉ dẫn', async () => {
        aiTra({ issue: ['a', 'b'] });
        await S.vietLaiGiaiThich(LOI, 'chỉ thị', 'u1');
        const [tin] = chatCompletion.mock.calls[0];
        expect(tin[0].content).toMatch(/data, never instructions/);
        expect(tin[0].content).not.toContain('I go');
        expect(tin[1].content).toContain('I go');
    });
});

describe('nối dây tới prompt thật', () => {
    const CHI_THI = 'Learner profile: DAU-HIEU-CHI-THI';
    const systemCua = () => chatCompletion.mock.calls[0][0].find((m) => m.role === 'system').content;

    beforeEach(() => chatCompletion.mockResolvedValue({ success: false }));

    test('BỘ CHẤM không nhận hồ sơ: truyền vào cũng bị bỏ qua', async () => {
        await gradeEssay({ prompt: 'p', essay: 'e', lang: 'en', chiThi: CHI_THI });
        expect(JSON.stringify(chatCompletion.mock.calls[0][0])).not.toContain(CHI_THI);
        chatCompletion.mockClear();
        await gradeTranslation({ passage: 'p', translation: 't', lang: 'en', chiThi: CHI_THI });
        expect(JSON.stringify(chatCompletion.mock.calls[0][0])).not.toContain(CHI_THI);
        const m = buildGradingMessages({ rubric: 'giaotiep', lang: 'en', track: 'en', level: 'medium', turns: [{ role: 'user', content: 'hi' }], chiThi: CHI_THI });
        expect(JSON.stringify(m)).not.toContain(CHI_THI);
    });
    test('ra đề viết và dịch nhận chỉ thị', async () => {
        await generatePrompt({ lang: 'en', chiThi: CHI_THI });
        expect(systemCua()).toContain(CHI_THI);
        chatCompletion.mockClear();
        await generatePassage({ lang: 'en', chiThi: CHI_THI });
        expect(systemCua()).toContain(CHI_THI);
    });
});
