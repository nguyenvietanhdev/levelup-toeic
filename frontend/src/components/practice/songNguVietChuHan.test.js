/**
 * Kho SONG NGỮ (`bi`) phải dùng được ở mọi chỗ kho `zh` dùng được.
 *
 * Mỗi bản ghi song ngữ đều có chữ Hán, nên "Luyện viết chữ Hán" chạy được y
 * như kho `zh`. Nhưng ba chốt chặn đều viết `=== 'zh'` / `!== 'zh'` nên khoá
 * nhầm nó — và lời nhắc còn bảo người đang ở kho đầy chữ Hán đi "đổi sang
 * tiếng Trung".
 *
 * Ô chọn ngôn ngữ ở Cài đặt cũng thiếu hẳn lựa chọn `bi`, trong khi thanh nav
 * đã có: đổi ở nav xong vào Cài đặt thì dropdown hiện sai giá trị, và chọn lại
 * là mất luôn.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const home = readFileSync(
    join(__dirname, '..', 'home', 'HomeScreen.jsx'), 'utf8');
const pm = readFileSync(join(__dirname, 'practiceManager.js'), 'utf8');
const hanzi = readFileSync(join(__dirname, 'modes', 'hanziWriting.js'), 'utf8');
const panel = readFileSync(
    join(__dirname, '..', 'settings', 'panels', 'PracticePanel.jsx'), 'utf8');
const nav = readFileSync(
    join(__dirname, '..', '..', 'layouts', 'QuickSettings.jsx'), 'utf8');

describe('Cài đặt có đủ ba lựa chọn ngôn ngữ', () => {
    test('có option `bi`', () => {
        expect(panel).toMatch(/<option value="bi">/);
    });

    test('đủ cả ba, khớp với thanh nav', () => {
        const cua = (src) => [...src.matchAll(/<option value="(en|zh|bi)"/g)].map((m) => m[1]);
        expect(cua(panel)).toEqual(['en', 'zh', 'bi']);
        // Nav là nơi đã đúng từ trước — hai chỗ lệch nhau thì đổi bên này xong
        // sang bên kia thấy giá trị khác.
        expect(new Set(cua(nav))).toEqual(new Set(['en', 'zh', 'bi']));
    });
});

describe('Cài đặt tôn trọng mốc Level như thanh nav', () => {
    test('chặn cả `zh` lẫn `bi` khi chưa đủ Level', () => {
        // Kho song ngữ cũng có chữ Hán nên chịu chung mốc — mở nó ra khi chưa
        // mở tiếng Trung là đi cửa sau.
        expect(panel).toMatch(/if \(next === 'zh' \|\| next === 'bi'\)/);
    });

    test('dùng CÙNG khoá tính năng với nav', () => {
        // Hai khoá khác nhau thì một bên mở một bên đóng, không ai hiểu vì sao.
        expect(panel).toMatch(/lockInfo\('feature:lang-zh'\)/);
        expect(nav).toMatch(/lockInfo\('feature:lang-zh'\)/);
    });

    test('chặn TRƯỚC khi ghi cài đặt', () => {
        // Ghi rồi mới chặn là giá trị đã vào `settings` và lần tải sau vẫn dùng.
        const i = panel.indexOf("lockInfo('feature:lang-zh')");
        const j = panel.indexOf("updateSetting('vocabLang', next)");
        expect(i).toBeGreaterThan(-1);
        expect(i).toBeLessThan(j);
    });
});

describe('"Luyện viết chữ Hán" mở cho kho song ngữ', () => {
    test('màn hình chính không còn so `!== \'zh\'` trần', () => {
        expect(home).toMatch(/const coChuHan = \(lang\) => lang === 'zh' \|\| lang === 'bi'/);
        expect(home).toMatch(/m\.zhOnly && !coChuHan\(getVocabLang\(\)\)/);
        expect(home).toMatch(/modeConfig\?\.zhOnly && !coChuHan\(getVocabLang\(\)\)/);
    });

    test('cả hai chốt ở màn hình chính đều dùng chung hàm', () => {
        // Thẻ bị làm mờ và lời nhắc khi bấm là HAI chỗ khác nhau; sửa một chỗ
        // thì thẻ mở mà bấm vào vẫn bị chặn (hoặc ngược lại).
        const so = (home.match(/coChuHan\(getVocabLang\(\)\)/g) || []).length;
        expect(so).toBe(2);
    });

    test('`PracticeManager` cũng cho `bi` qua', () => {
        const i = pm.indexOf("case 'hanzi-writing':");
        expect(i).toBeGreaterThan(-1);
        const khoi = pm.slice(i, pm.indexOf('break;', i));
        expect(khoi).toMatch(/vocabLang\(\) !== 'zh' && vocabLang\(\) !== 'bi'/);
    });

    test('lời nhắc không còn bảo người dùng đổi sang tiếng Trung', () => {
        // Họ ĐANG ở kho đầy chữ Hán — câu đó vô nghĩa với người ở kho `bi`.
        const i = pm.indexOf("case 'hanzi-writing':");
        const khoi = pm.slice(i, pm.indexOf('break;', i));
        expect(khoi).toMatch(/Trung–Anh/);
    });
});

describe('lấy đúng chữ Hán từ bản ghi song ngữ', () => {
    /** `chuHanCua` dựng từ chính mã nguồn rồi gọi thật. */
    const chuHanCua = (() => {
        // Chuẩn hoá CRLF trước: file nguồn dùng xuống dòng kiểu Windows nên
        // mẫu kết thúc bằng `;\n` bắt trúng `;\r` rồi dừng sai chỗ.
        const m = hanzi.replace(/\r/g, '').match(/const chuHanCua = ([\s\S]*?);\n/);
        expect(m, 'không tìm thấy `chuHanCua`').toBeTruthy();
        return new Function(`return ${m[1]};`)();
    })();

    test('kho song ngữ: lấy từ `matZh.tu`', () => {
        // `en` của mapper đổi theo chiều học (`bi` chiều ngược đặt từ tiếng Anh
        // vào đó), `matZh` thì không — nên nó mới là nguồn tin cậy.
        expect(chuHanCua({ matZh: { tu: '你好' }, en: 'hello', songNgu: true }))
            .toBe('你好');
    });

    test('song ngữ chiều thường cũng ra chữ Hán', () => {
        expect(chuHanCua({ matZh: { tu: '多少' }, en: '多少', songNgu: true }))
            .toBe('多少');
    });

    test('kho `zh` cũ vẫn dùng `zh`', () => {
        expect(chuHanCua({ zh: '谢谢', en: '谢谢' })).toBe('谢谢');
    });

    test('bản ghi rỗng trả chuỗi rỗng, không ném lỗi', () => {
        expect(chuHanCua(null)).toBe('');
        expect(chuHanCua({})).toBe('');
    });
});

describe('phiên âm và nghĩa khớp MẶT chữ Hán', () => {
    test('phiên âm lấy từ `matZh`, không theo chiều học', () => {
        // Đang viết 你好 mà hiện phiên âm của `hello` là chỉ dẫn sai.
        expect(hanzi).toMatch(/w\.matZh \? \(w\.matZh\.phonetic \|\| ''\) : \(w\.phonetic \|\| ''\)/);
    });

    test('kho song ngữ lấy nghĩa từ mặt tiếng Anh', () => {
        // Kho này không có nghĩa tiếng Việt.
        expect(hanzi).toMatch(/w\.songNgu \? \(w\.matEn\?\.tu \|\| w\.vn \|\| ''\)/);
    });
});
