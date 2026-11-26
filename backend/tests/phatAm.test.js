/**
 * Tra cứu phát âm. Chỗ dễ hỏng: gõ chữ Nhật/Hàn mà vẫn tra theo tiếng Anh; hỏi AI lại cho câu đã
 * có (tốn tiền mãi); AI trả rác vẫn lưu vào kho chung; hết lượt vẫn gọi AI; lỗi AI vẫn trừ lượt.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
jest.mock('../models/PhatAmTra', () => ({ findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/PhatAmLuot', () => ({ findOneAndUpdate: jest.fn(), updateOne: jest.fn(), findOne: jest.fn() }));

const { chatCompletion } = require('../config/openai');
const PhatAmTra = require('../models/PhatAmTra');
const PhatAmLuot = require('../models/PhatAmLuot');
const P = require('../services/phatAm');

const lean = (v) => ({ lean: () => Promise.resolve(v) });
const KET_QUA_AI = {
    chuan: 'ˈθæŋk ju',
    docViet: 'THANH-kiu',
    docLienMach: 'THANH-kiu',
    tu: [{ tu: 'thank', chuan: 'θæŋk', docViet: 'THANH', luuY: 'th: đặt lưỡi giữa hai răng' }, { tu: 'you', chuan: 'ju', docViet: 'kiu' }],
    noiAm: [{ cum: 'thank you', hienTuong: 'Nối âm', truoc: 'thanh diu', sau: 'thanh-kiu', giaiThich: 'Âm k cuối nối sang you.' }],
    meo: ['Đừng đọc th thành "th" tiếng Việt.'],
};

beforeEach(() => {
    jest.clearAllMocks();
    PhatAmTra.findOneAndUpdate.mockReturnValue(lean(null));
    PhatAmTra.updateOne.mockReturnValue(Promise.resolve({}));
    PhatAmLuot.findOneAndUpdate.mockResolvedValue({ so: 1 });
    PhatAmLuot.updateOne.mockReturnValue(Promise.resolve({}));
    PhatAmLuot.findOne.mockReturnValue({ select: () => lean({ so: 1 }) });
    chatCompletion.mockResolvedValue({ success: true, content: JSON.stringify(KET_QUA_AI) });
});

describe('chọn ngôn ngữ theo chữ viết', () => {
    test('chữ Nhật / Hàn / Hán thắng lựa chọn của người học', () => {
        expect(P.chonNgonNgu('ありがとう', 'en')).toBe('ja');
        expect(P.chonNgonNgu('감사합니다', 'en')).toBe('ko');
        expect(P.chonNgonNgu('谢谢', 'en')).toBe('zh');
    });
    test('chữ Latin theo lựa chọn; tra được cả ngôn ngữ chưa mở cho người học (chỉ cần AI)', () => {
        expect(P.chonNgonNgu('ni hao', 'zh')).toBe('zh');
        expect(P.chonNgonNgu('arigatou', 'ja')).toBe('ja');
        expect(P.chonNgonNgu('hello', 'xx')).toBe('en');
    });
    test('khoá cache: chữ Latin không phân biệt hoa thường, bỏ dấu kết câu', () => {
        expect(P.khoaTra('Thank  You!', 'en')).toBe(P.khoaTra('thank you', 'en'));
        expect(P.khoaTra('谢谢。', 'zh')).toBe('zh:谢谢');
    });
});

describe('prompt theo sổ ngôn ngữ', () => {
    test('mỗi ngôn ngữ một chuẩn phiên âm và hiện tượng nối âm riêng', () => {
        expect(P.promptHe('zh')).toMatch(/Pinyin/);
        expect(P.promptHe('zh')).toMatch(/third-tone sandhi/);
        expect(P.promptHe('ja')).toMatch(/hiragana/);
        expect(P.promptHe('ko')).toMatch(/비음화/);
        expect(P.promptHe('en')).toMatch(/IPA/);
        expect(P.promptHe('en')).toMatch(/Vietnamese letters/);
    });
});

describe('làm sạch kết quả AI', () => {
    test('thiếu phiên âm hoặc cách đọc kiểu Việt → không dùng được', () => {
        expect(P.chuanHoaKetQua({ chuan: 'x' })).toBeNull();
        expect(P.chuanHoaKetQua(null)).toBeNull();
    });
    test('cắt danh sách, bỏ mục rỗng, thiếu cách đọc liền mạch thì lấy cách đọc từng từ', () => {
        const r = P.chuanHoaKetQua({
            chuan: 'a', docViet: 'b',
            tu: [{ tu: '' }, ...Array.from({ length: 20 }, (_, i) => ({ tu: `w${i}`, chuan: 'x' }))],
            noiAm: [{ cum: 'x' }], meo: ['', 'm'],
        });
        expect(r.tu).toHaveLength(12);
        expect(r.noiAm).toEqual([]);
        expect(r.meo).toEqual(['m']);
        expect(r.docLienMach).toBe('b');
    });
});

describe('tra', () => {
    test('câu mới: hỏi AI một lần, lưu vào kho chung, trả kết quả kèm số lượt còn', async () => {
        const r = await P.tra('u1', { text: 'Thank you', lang: 'en' });
        expect(r).toMatchObject({ lang: 'en', tenNgonNgu: 'Tiếng Anh', tuCache: false, conLuot: 19 });
        expect(r.ketQua.noiAm[0].hienTuong).toBe('Nối âm');
        expect(chatCompletion).toHaveBeenCalledTimes(1);
        expect(PhatAmTra.updateOne).toHaveBeenCalledWith({ khoa: 'en:thank you' }, expect.anything(), { upsert: true });
    });

    test('câu đã có: dùng lại, không gọi AI, không trừ lượt', async () => {
        PhatAmTra.findOneAndUpdate.mockReturnValue(lean({ ketQua: KET_QUA_AI }));
        const r = await P.tra('u1', { text: 'thank you!', lang: 'en' });
        expect(r.tuCache).toBe(true);
        expect(chatCompletion).not.toHaveBeenCalled();
        expect(PhatAmLuot.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('gõ tiếng Hàn khi đang chọn tiếng Anh: tra theo tiếng Hàn', async () => {
        const r = await P.tra('u1', { text: '감사합니다', lang: 'en' });
        expect(r.lang).toBe('ko');
        expect(chatCompletion.mock.calls[0][0][0].content).toMatch(/Korean pronunciation coach/);
    });

    test('hết lượt: báo 429, không gọi AI', async () => {
        PhatAmLuot.findOneAndUpdate.mockResolvedValue(null);
        const r = await P.tra('u1', { text: 'hello' });
        expect(r.ma).toBe(429);
        expect(chatCompletion).not.toHaveBeenCalled();
    });

    test('AI trả rác: trả lại lượt, không lưu', async () => {
        chatCompletion.mockResolvedValue({ success: true, content: 'không phải JSON' });
        const r = await P.tra('u1', { text: 'hello' });
        expect(r.ma).toBe(503);
        expect(PhatAmLuot.updateOne).toHaveBeenCalled();
        expect(PhatAmTra.updateOne).not.toHaveBeenCalled();
    });

    test('đầu vào không hợp lệ: rỗng, quá dài, chỉ có số', async () => {
        expect((await P.tra('u1', { text: '  ' })).ma).toBe(400);
        expect((await P.tra('u1', { text: 'a'.repeat(P.TOI_DA_KY_TU + 5) })).ma).toBe(400);
        expect((await P.tra('u1', { text: '123 !!' })).ma).toBe(400);
        expect(chatCompletion).not.toHaveBeenCalled();
    });
});
