/**
 * Kho song ngữ: giọng đọc và nhãn ngôn ngữ.
 *
 * Gốc chung của mọi lỗi ở đây: code hỏi "KHO này ngôn ngữ gì" trong khi kho
 * song ngữ có CẢ HAI mặt trong một bản ghi. Câu hỏi đúng là "đoạn chữ NÀY
 * ngôn ngữ gì".
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nhanKho } from '@lib/nhanKho.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...p) => readFileSync(join(__dirname, ...p), 'utf8');
const gl = F('..', '..', 'game', 'gameLogic.js');
const sound = F('..', 'settings', 'panels', 'SoundPanel.jsx');
const nhan = F('nhanNgonNgu.js');

/** Thân `speakWord`. */
const thanSpeak = () => {
    const i = gl.indexOf('speakWord(text, lang');
    expect(i).toBeGreaterThan(-1);
    return gl.slice(i, gl.indexOf('\n    async _speakGoogleTTS', i));
};

describe('giọng chọn theo VĂN BẢN, không theo kho', () => {
    test('không còn hỏi `getVocabLang() === \'zh\'`', () => {
        // Kho song ngữ trả 'bi' nên nhánh đó luôn false → đọc chữ Hán bằng
        // giọng Mỹ, nghe không ra chữ nào.
        // Bỏ comment trước khi soi: chính comment giải thích cũng nhắc lại
        // cách cũ, nên soi văn bản thô là báo nhầm.
        const t = thanSpeak().replace(/\/\/[^\n]*/g, '');
        expect(t).not.toMatch(/getVocabLang\(\) === 'zh'/);
    });

    test('quyết định bằng chính đoạn chữ — khi KHÔNG ai nói rõ', () => {
        // Nhận diện giờ là LỐI LÙI, không phải luật. Chỗ gọi biết chắc thì
        // truyền mã vào và hàm nghe theo — xem `heChu` bên dưới.
        const t = thanSpeak();
        expect(t).toMatch(/const isZhText = /);
        expect(t).toMatch(/: \(isZhText \? 'zh' : isViText \? 'vi' : 'en'\)/);
        expect(t).toMatch(/const isZhMode = heChu === 'zh'/);
    });

    test('mã được TRUYỀN VÀO thắng nhận diện', () => {
        // Bản cũ luôn ghi đè `lang` bằng kết quả đoán, nên tham số `lang` hoàn
        // toàn vô nghĩa: nghĩa tiếng Việt không dấu ("hoa", "ban") bị đọc bằng
        // giọng Anh dù chỗ gọi thừa biết đó là ô nghĩa tiếng Việt.
        const t = thanSpeak();
        expect(t).toMatch(/const maDaBiet = String\(lang \|\| ''\)\.trim\(\)/);
        expect(t).toMatch(/const heChu = maDaBiet/);
        // Và KHÔNG còn ghi đè vô điều kiện.
        expect(t).not.toMatch(/if \(isZhText\) lang = 'zh-CN';/);
    });

    test('mặc định là `null` — "chưa ai nói", không phải "tiếng Anh"', () => {
        // Để mặc định `'en-US'` thì không phân biệt được "không biết" với "biết
        // chắc là tiếng Anh", nên không thể cho mã truyền vào thắng.
        expect(gl).toMatch(/speakWord\(text, lang = null, onEnd = null\)/);
    });

    test('giọng đã lưu phải KHỚP ngôn ngữ mới được dùng', () => {
        // Người dùng chọn giọng Anh cho kho song ngữ là hợp lệ — nhưng gán nó
        // cho câu chữ Hán thì máy đọc từng ký tự như chữ cái, hoặc im.
        const t = thanSpeak();
        expect(t).toMatch(/const dungNgonNgu = selectedVoice/);
        expect(t).toMatch(/selectedVoice\.lang\.startsWith/);
    });

    test('sai ngôn ngữ thì thay bằng giọng đúng, không bỏ trống', () => {
        expect(thanSpeak()).toMatch(/const thayThe = voices\.find/);
    });

    test('Google TTS sửa giọng CẢ HAI chiều', () => {
        // Chiều Hán→ZH đã có. Chiều ngược cần từ khi có kho song ngữ: đang học
        // mặt Hán rồi nghe câu ví dụ tiếng Anh thì `voiceKey` trỏ giọng Trung.
        const t = thanSpeak();
        // Theo `heChu` chứ không soi thẳng `isZhText`: soi mặt chữ ở đây là bỏ
        // qua điều chỗ gọi vừa khẳng định.
        expect(t).toMatch(/if \(heChu === 'zh' && !isZhVoice\) effectiveVoice = '__gtts_zh_random__'/);
        expect(t).toMatch(/heChu === 'en' && \(isZhVoice \|\| isViVoice\)\) effectiveVoice = '__gtts_random__'/);
    });
});

describe('kho song ngữ mở CẢ HAI ô chọn giọng', () => {
    test('không ô nào bị khoá khi ở `bi`', () => {
        expect(sound).toMatch(/const laSongNgu = vocabLang === 'bi'/);
        expect(sound).toMatch(/const tatZh = !isZh && !laSongNgu/);
    });

    test('kho tiếng Anh vẫn khoá ô giọng Trung', () => {
        // Thêm luật mới không được nuốt luật cũ.
        const i = sound.indexOf('const tatZh');
        expect(sound.slice(i, i + 60)).toMatch(/!isZh/);
    });

    test('kho tiếng Trung vẫn khoá ô giọng Anh', () => {
        expect(sound).toMatch(/const tatEn = isZh/);
    });

    test('không còn dùng `isZh` trần để khoá', () => {
        // Đó là cách cũ, và nó xếp kho song ngữ vào nhánh tiếng Anh.
        expect(sound).not.toMatch(/disabled=\{isZh\}/);
        expect(sound).not.toMatch(/disabled=\{!isZh\}/);
    });
});

describe('nhãn ngôn ngữ theo CẶP đang học', () => {
    // Bảng nhãn nay ở module LÁ `lib/nhanKho.js` — `gameLogic` cũng cần nó để
    // đặt câu hỏi, mà `nhanNgonNgu` lại import `vocabLang` TỪ `gameLogic`, nên
    // để bảng ở một trong hai chỗ đó là vòng import. Nội dung bảng được kiểm
    // bằng cách GỌI THẬT ở `lib/nhanKho.test.js`.
    test('kho song ngữ: Trung – Anh, KHÔNG có tiếng Việt', () => {
        expect(nhanKho('bi')).toEqual({ tu: 'Tiếng Trung', nghia: 'Tiếng Anh' });
    });

    test('hai kho cũ giữ nhãn cũ', () => {
        expect(nhanKho('zh')).toEqual({ tu: 'Tiếng Trung', nghia: 'Tiếng Việt' });
        expect(nhanKho('en')).toEqual({ tu: 'Tiếng Anh', nghia: 'Tiếng Việt' });
    });

    test('`nhanNgonNgu` dùng LẠI bảng đó, không chép tay', () => {
        expect(nhan).toMatch(/return nhanKho\(vocabLang\(\)\)/);
    });

    test('đảo chiều thì nhãn đổi chỗ theo', () => {
        // Không đổi thì người học đọc tiêu đề một đằng thấy nội dung một nẻo.
        expect(nhan).toMatch(/dao \? \{ trai: nghia, phai: tu \}/);
    });

    test('Nối từ dùng nhãn động, không viết cứng', () => {
        const m = F('modes', 'matching.js');
        expect(m).toMatch(/nhanTheoChieu\(GameLogic\.isReversed\(\)\)/);
        expect(m).not.toMatch(/<h4>Tiếng Anh<\/h4>/);
        expect(m).not.toMatch(/<h4>Tiếng Việt<\/h4>/);
    });

    test('Đọc phiên âm và Nghe cũng vậy', () => {
        expect(F('modes', 'phoneticQuiz.js')).toMatch(/Từ \$\{nhanCapHoc\(\)\.tu\} nào/);
        expect(F('modes', 'listening.js')).toMatch(/Chọn từ \$\{nhanCapHoc\(\)\.tu\} tương ứng/);
    });
});

describe('Điền vào câu: gọn hơn, có nút nghe', () => {
    const efb = F('modes', 'exampleFillBlank.js');
    const css = F('..', '..', 'assets', 'styles', 'components.css');

    test('câu ví dụ có nút nghe + phiên âm', () => {
        // Trước đây chỉ có bản dịch — hiểu nghĩa nhưng không biết phát âm.
        expect(efb).toMatch(/import \{ chenViDu \}/);
        // Soi LỜI GỌI thật, không phải "có chuỗi chenViDu( ở đâu đó": bọc nó
        // sau `false &&` hay `// ` vẫn khớp mà nút thì không bao giờ hiện.
        const code = efb.replace(/\/\/[^\n]*/g, '');
        expect(code).toMatch(/^\s*chenViDu\($/m);
    });

    test('dùng module CHUNG, không tự dựng nút', () => {
        // Mười chế độ khác đã đi qua `exampleBlock`; chép tay là thêm một chỗ
        // để lệch.
        expect(efb).toMatch(/from '\.\.\/exampleBlock\.js'/);
    });

    test('bốn đáp án trên MỘT hàng', () => {
        const i = css.indexOf('.options-grid {');
        const rule = css.slice(css.indexOf('{', i), css.indexOf('}', i));
        expect(rule).toMatch(/repeat\(auto-fit, minmax\(130px, 1fr\)\)/);
        expect(rule).not.toMatch(/repeat\(2, 1fr\)/);
    });

    test('màn hẹp vẫn rớt xuống được, không bóp chữ', () => {
        // `auto-fit` + `minmax` lo việc đó; ép cứng 4 cột thì chữ Hán bị bóp
        // đến mức không đọc được.
        const i = css.indexOf('.options-grid {');
        expect(css.slice(css.indexOf('{', i), css.indexOf('}', i))).toMatch(/auto-fit/);
    });
});
