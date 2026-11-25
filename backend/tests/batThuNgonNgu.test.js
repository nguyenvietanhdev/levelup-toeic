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

    test('prompt AI: tên ngôn ngữ trong prompt là "Japanese"', () => {
        expect(N.tenChoPrompt('ja')).toBe('Japanese');
        expect(N.tenPromptDayDu('ja')).toBe('Japanese');
    });

    test('ra đề khi CHƯA viết nhánh nội dung tiếng Nhật: báo rõ thiếu gì, không ra đề tiếng Anh', async () => {
        const G = require('../services/translationGrader');
        await expect(G.generatePassage({ tuVung: ['勉強'], lang: 'ja', chieu: 'ngoai-vi' })).rejects.toThrow(/Dịch ngược: prompt ra đề.*"ja"/);
        expect(chatCompletion).not.toHaveBeenCalled();
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

describe('mở tiếng Nhật cần thêm nội dung gì', () => {
    test('thieuNoiDung liệt kê đúng các bảng còn thiếu (danh sách việc phải làm)', () => {
        const fs = require('fs');
        const path = require('path');
        for (const thu of ['services', 'controllers', 'routes']) {
            for (const ten of fs.readdirSync(path.join(__dirname, '..', thu))) {
                const p = path.join(__dirname, '..', thu, ten);
                if (ten.endsWith('.js') && fs.readFileSync(p, 'utf8').includes('bangNgonNgu(')) require(p);
            }
        }
        const thieu = N.thieuNoiDung('ja');
        expect(thieu).toEqual(expect.arrayContaining(['Viết luận: tiêu chí mặc định', 'Kiểm tra đầu vào: bộ đề', 'Phản xạ câu: các khung câu']));
        expect(N.thieuNoiDung('en')).toEqual([]);
    });
});
