/**
 * "Đổi ở một nơi, mọi nơi tự theo": giả lập BẬT tiếng Nhật trong sổ ngôn ngữ (chỉ trong test) và
 * kiểm mọi đường lõi tự chuyển sang tiếng Nhật — không còn chỗ nào âm thầm rơi về tiếng Anh.
 *
 * Đây là bằng chứng cho bước 0: muốn mở một ngôn ngữ mới, phần code chỉ là khai báo trong sổ
 * (`config/ngonNgu.json`); phần còn lại là nội dung (kho từ, kho ngữ pháp…).
 */
jest.mock('../config/ngonNgu.json', () => {
    const that = jest.requireActual('../config/ngonNgu.json');
    return { ...that, ngonNgu: that.ngonNgu.map((n) => (n.ma === 'ja' ? { ...n, hoatDong: true } : n)) };
});
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');
const N = require('../config/ngonNgu');

beforeEach(() => chatCompletion.mockReset().mockResolvedValue({ success: true, content: '{"passage":"x","topic":"y","scores":{}}' }));

describe('bật thử tiếng Nhật trong sổ', () => {
    test('sổ: tiếng Nhật thành ngôn ngữ đang mở; thiết lập người dùng nhận ja', () => {
        expect(N.NGON_NGU_HOAT_DONG).toEqual(['en', 'zh', 'ja']);
        expect(N.chuanMa('ja')).toBe('ja');
        expect(N.locThietLap({ vocabLang: 'ja' })).toEqual({ vocabLang: 'ja' });
    });

    test('giọng đọc: Nghe với AI dùng giọng Nhật, không phải giọng Anh theo vùng', () => {
        const L = require('../services/listeningAi');
        expect(L.chonGiong('ja', 'us')).toMatchObject({ giong: 'ja-JP-NanamiNeural', vung: '' });
        expect(L.GIONG_THEO_NGON_NGU.ja).toBe('ja-JP-NanamiNeural');
    });

    test('prompt AI: sinh đề dịch nói "Japanese", không phải "English"', async () => {
        const G = require('../services/translationGrader');
        await G.generatePassage({ tuVung: ['勉強'], lang: 'ja', chieu: 'ngoai-vi' });
        const sys = chatCompletion.mock.calls[0][0][0].content;
        expect(sys).toMatch(/natural Japanese/);
        expect(sys).not.toMatch(/English/);
    });

    test('nhận diện: lời bài hát tiếng Nhật không còn bị chặn, gán đúng ja', () => {
        expect(N.nhanDienChuViet('君の名前を教えて')).toBe('ja');
        expect(N.NGON_NGU_HOAT_DONG.includes(N.nhanDienChuViet('君の名前を教えて'))).toBe(true);
    });

    test('chưa có kho từ vựng tiếng Nhật: báo rõ phải khai gì, không rơi nhầm sang kho tiếng Anh', () => {
        const { khoTuVung } = require('../services/khoTuVung');
        expect(() => khoTuVung('ja')).toThrow(/chưa có kho từ vựng/);
    });
});
