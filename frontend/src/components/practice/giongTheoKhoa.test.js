/**
 * Giọng đọc theo KHOÁ dữ liệu, không theo nhận diện mặt chữ.
 *
 * Nhận diện chỉ là ĐOÁN: nó nhìn xem đoạn chữ có ký tự Hán hay dấu tiếng Việt
 * không. Nghĩa tiếng Việt KHÔNG DẤU — "hoa", "ban", "cam", "am nhac" — trông y
 * hệt tiếng Anh, nên bị đọc bằng giọng Anh. Trong khi chỗ gọi thừa biết đoạn
 * chữ đó lấy từ khoá nào: `w.en` là mặt từ, `w.vn` là mặt nghĩa.
 *
 * Đã biết thì đừng đoán. Nhận diện chỉ còn là lối lùi cho chỗ gọi không có
 * thông tin.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...p) => readFileSync(join(__dirname, ...p), 'utf8');
const gl = F('..', '..', 'game', 'gameLogic.js');
const matching = F('modes', 'matching.js');

vi.mock('@game/gameLogic.js', () => ({
    vocabLang: vi.fn(() => 'en'),
}));
const { maCapHoc, maTheoChieu } = await import('./nhanNgonNgu.js');
const { vocabLang } = await import('@game/gameLogic.js');

beforeEach(() => vocabLang.mockReturnValue('en'));
afterEach(() => vi.clearAllMocks());

describe('`maCapHoc` — ngôn ngữ của từng MẶT', () => {
    test('kho tiếng Anh: từ EN, nghĩa VI', () => {
        vocabLang.mockReturnValue('en');
        expect(maCapHoc()).toEqual({ tu: 'en-US', nghia: 'vi-VN' });
    });

    test('kho tiếng Trung: từ ZH, nghĩa VI', () => {
        vocabLang.mockReturnValue('zh');
        expect(maCapHoc()).toEqual({ tu: 'zh-CN', nghia: 'vi-VN' });
    });

    test('kho song ngữ: từ ZH, nghĩa EN — KHÔNG có tiếng Việt', () => {
        // Học Trung ↔ Anh thì không có vế tiếng Việt nào; trả 'vi-VN' ở đây là
        // đọc `hello` bằng giọng Việt.
        vocabLang.mockReturnValue('bi');
        expect(maCapHoc()).toEqual({ tu: 'zh-CN', nghia: 'en-US' });
    });

    test('song ngữ chiều ĐẢO: đọc theo CHÍNH BẢN GHI', () => {
        // Một kho chứa cả hai chiều (`hienThi` của từng bản ghi), nên hỏi "kho
        // này mặt trước là gì" là câu hỏi sai.
        vocabLang.mockReturnValue('bi');
        expect(maCapHoc({ ttsLang: 'en-US' })).toEqual({ tu: 'en-US', nghia: 'zh-CN' });
        expect(maCapHoc({ ttsLang: 'zh-CN' })).toEqual({ tu: 'zh-CN', nghia: 'en-US' });
    });

    test('hai kho cũ KHÔNG bị bản ghi làm đổi ý', () => {
        // `ttsLang` chỉ có nghĩa ở kho song ngữ; để nó chi phối kho `zh` là một
        // bản ghi lạ làm hỏng cả cột.
        vocabLang.mockReturnValue('zh');
        expect(maCapHoc({ ttsLang: 'en-US' })).toEqual({ tu: 'zh-CN', nghia: 'vi-VN' });
    });
});

describe('`maTheoChieu` — đảo chiều thì đổi chỗ', () => {
    test('chiều thường', () => {
        vocabLang.mockReturnValue('zh');
        expect(maTheoChieu(false)).toEqual({ trai: 'zh-CN', phai: 'vi-VN' });
    });

    test('đảo chiều', () => {
        vocabLang.mockReturnValue('zh');
        expect(maTheoChieu(true)).toEqual({ trai: 'vi-VN', phai: 'zh-CN' });
    });
});

describe('`speakWord` nghe theo mã được truyền vào', () => {
    /**
     * Thân `speakWord`, cắt tới hàm kế tiếp.
     *
     * Neo vào tên hàm sau nó chứ không đếm ký tự: khối sửa giọng nằm khá sâu
     * và cửa sổ cố định vừa đủ hôm nay là hụt ngay khi thêm vài dòng.
     */
    const thanSpeak = () => {
        const i = gl.indexOf('speakWord(text, lang');
        expect(i).toBeGreaterThan(-1);
        const j = gl.indexOf('async _speakGoogleTTS', i);
        expect(j).toBeGreaterThan(i);
        return gl.slice(i, j);
    };

    test('mặc định `null` = "chưa ai nói"', () => {
        // `'en-US'` làm mặc định thì không phân biệt được "không biết" với
        // "biết chắc là tiếng Anh" — nên không thể cho mã truyền vào thắng.
        expect(gl).toMatch(/speakWord\(text, lang = null, onEnd = null\)/);
    });

    test('có mã thì dùng mã, không có mới đoán', () => {
        const t = thanSpeak();
        expect(t).toMatch(/const maDaBiet = String\(lang \|\| ''\)\.trim\(\)/);
        // Nhánh ba ngôi: có mã → suy từ mã; không có → nhận diện.
        expect(t).toMatch(/const heChu = maDaBiet[\s\S]{0,160}isZhText \? 'zh' : isViText \? 'vi' : 'en'/);
    });

    test('KHÔNG còn ghi đè `lang` vô điều kiện', () => {
        // Đây là dòng khiến tham số `lang` vô nghĩa suốt thời gian qua.
        const t = thanSpeak();
        expect(t).not.toMatch(/^\s*if \(isZhText\) lang = 'zh-CN';$/m);
    });

    test('khoá giọng và sửa giọng đều đi theo `heChu`', () => {
        // Sót một chỗ là mã truyền vào đúng mà giọng vẫn lấy theo mặt chữ.
        const t = thanSpeak();
        expect(t).toMatch(/const isZhMode = heChu === 'zh'/);
        expect(t).toMatch(/: heChu === 'vi' \? 'toeic_voice_vi'/);
        expect(t).toMatch(/if \(heChu === 'zh' && !isZhVoice\)/);
        expect(t).toMatch(/else if \(heChu === 'vi' && !isViVoice\)/);
    });
});

describe('chế độ Nối từ: giọng theo CỘT', () => {
    test('cột trái mang mã của mặt TỪ', () => {
        // `generateMatching` luôn đặt `w.en` bên trái.
        const i = matching.indexOf('data-side="left"');
        expect(matching.slice(i, i + 300)).toMatch(/data-lang="\$\{maCapHoc\(item\.wordData\)\.tu\}"/);
    });

    test('cột phải mang mã của mặt NGHĨA', () => {
        const i = matching.indexOf('data-side="right"');
        expect(matching.slice(i, i + 300)).toMatch(/data-lang="\$\{maCapHoc\(item\.wordData\)\.nghia\}"/);
    });

    test('mã tính theo TỪNG bản ghi, không theo cả lượt', () => {
        // Truyền `item.wordData` vào mới đúng được kho song ngữ hai chiều.
        expect((matching.match(/maCapHoc\(item\.wordData\)/g) || []).length).toBe(2);
    });

    test('handler đọc mã từ `data-lang`, không để tự đoán', () => {
        const i = matching.indexOf('.matching-word-text');
        const t = matching.slice(i, i + 600);
        expect(t).toMatch(/speakWord\(wordEl\.dataset\.word, wordEl\.dataset\.lang \|\| null\)/);
    });
});

describe('không còn `en-US` truyền cứng ở chế độ luyện tập', () => {
    /** Mọi file chế độ, trừ nơi ngôn ngữ thật sự biết chắc. */
    const MODES = [
        'contextLearning', 'dictation', 'exampleFillBlank', 'listening',
        'multipleChoice', 'phoneticQuiz', 'sentenceBuilder', 'sentenceListening',
        'speedQuiz', 'synonymCheck', 'wordTypeCheck',
    ];

    for (const m of MODES) {
        test(`${m} không nói dối "en-US"`, () => {
            // Di sản hồi app chỉ có tiếng Anh. Từ khi có kho `zh`/`bi` thì
            // `word.en` có thể là chữ Hán — khai 'en-US' cho nó là sai hẳn, và
            // chính vì thế mới phải thêm nhận diện để che.
            const src = F('modes', `${m}.js`);
            const goi = src.match(/speakWord\([^;]*?\)/gs) || [];
            for (const g of goi) {
                // `dictation` có một chỗ 'zh-CN' nằm sau phép thử chữ Hán —
                // đó là biết chắc thật, không phải nói dối.
                expect(g).not.toMatch(/'en-US'/);
            }
        });
    }

    test('thử giọng ở Cài đặt VẪN khai rõ — đó là biết chắc', () => {
        // Bấm "thử giọng tiếng Anh" thì phải nghe giọng Anh, kể cả khi chữ mẫu
        // trông giống ngôn ngữ khác.
        const st = F('..', 'settings', 'SettingsScreen.jsx');
        expect(st).toMatch(/speakWord\('vocabulary', 'en-US'\)/);
        expect(st).toMatch(/'zh-CN'\)/);
    });

    test('`dictation` giữ `zh-CN` vì có phép thử chữ Hán ngay trước', () => {
        const src = F('modes', 'dictation.js');
        const i = src.indexOf("speakWord(text, 'zh-CN')");
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(Math.max(0, i - 200), i)).toMatch(/test\(text\)/);
    });
});
