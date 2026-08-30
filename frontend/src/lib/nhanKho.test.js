/**
 * Câu hỏi phải GỌI ĐÚNG TÊN ngôn ngữ của từng mặt.
 *
 * Đây là hậu quả của việc dùng lại một form cho ba kho: câu hỏi viết cứng
 * "tiếng Anh" / "tiếng Việt" từ hồi app chỉ có một kho, và khi thêm kho `zh`
 * rồi `bi` thì không ai rà lại. Kết quả người dùng gặp:
 *
 *   · kho `zh` — hỏi chữ HÁN mà form ghi "Từ tiếng Anh của từ trên là:";
 *   · kho `bi` — KHÔNG có tiếng Việt ở đâu, mà form vẫn hỏi "Nghĩa tiếng Việt
 *     của từ trên là:".
 *
 * Không có lỗi nào báo — chỉ là người học đọc một đằng, phải gõ một nẻo.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nhanKho, nhanKhoThuong, maKho } from './nhanKho.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gl = readFileSync(join(__dirname, '..', 'game', 'gameLogic.js'), 'utf8');
const nhan = readFileSync(
    join(__dirname, '..', 'components', 'practice', 'nhanNgonNgu.js'), 'utf8');

describe('bảng tên hai mặt', () => {
    test('kho tiếng Anh', () => {
        expect(nhanKho('en')).toEqual({ tu: 'Tiếng Anh', nghia: 'Tiếng Việt' });
    });

    test('kho tiếng Trung — mặt hỏi là chữ Hán, KHÔNG phải tiếng Anh', () => {
        expect(nhanKho('zh')).toEqual({ tu: 'Tiếng Trung', nghia: 'Tiếng Việt' });
    });

    test('kho song ngữ — KHÔNG có tiếng Việt ở vế nào', () => {
        const n = nhanKho('bi');
        expect(n).toEqual({ tu: 'Tiếng Trung', nghia: 'Tiếng Anh' });
        expect(JSON.stringify(n)).not.toMatch(/Việt/);
    });

    test('kho lạ rơi về tiếng Anh, không ném', () => {
        expect(nhanKho('xx')).toEqual({ tu: 'Tiếng Anh', nghia: 'Tiếng Việt' });
        expect(nhanKho(undefined).tu).toBe('Tiếng Anh');
    });

    test('bản viết thường để ghép giữa câu', () => {
        // "Nhập Tiếng Trung" đọc gợn; "Nhập từ tiếng Trung" mới xuôi.
        expect(nhanKhoThuong('zh')).toEqual({ tu: 'tiếng trung', nghia: 'tiếng việt' });
    });
});

describe('module LÁ — không import gì', () => {
    test('`nhanKho.js` không có `import`', () => {
        // `gameLogic` cần bảng này, mà `nhanNgonNgu` lại import `vocabLang` TỪ
        // `gameLogic`. Để bảng ở một trong hai chỗ đó là vòng import.
        const src = readFileSync(join(__dirname, 'nhanKho.js'), 'utf8');
        expect(src).not.toMatch(/^import /m);
    });

    test('`nhanNgonNgu` dùng lại bảng này, không chép tay', () => {
        // Chép tay là hai bản lệch nhau: sửa nhãn ở màn này còn màn kia giữ
        // nguyên, mà không có gì nhắc.
        expect(nhan).toMatch(/import \{ nhanKho, maKho \} from '@lib\/nhanKho\.js'/);
        expect(nhan).toMatch(/return nhanKho\(vocabLang\(\)\)/);
        expect(nhan).toMatch(/return maKho\(vocabLang\(\), word\)/);
    });
});

describe('câu hỏi ĐIỀN TỪ gọi đúng tên mặt', () => {
    /** Thân `generateFillBlank`. */
    const than = (() => {
        const i = gl.indexOf('generateFillBlank(word) {');
        expect(i).toBeGreaterThan(-1);
        return gl.slice(i, gl.indexOf('\n    },', i));
    })();

    test('KHÔNG còn viết cứng tên ngôn ngữ', () => {
        // Bỏ comment trước khi soi: chính lời giải thích cũng trích lại câu cũ.
        const sach = than.replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n').map((d) => d.replace(/\/\/.*/, '')).join('\n');
        expect(sach).not.toMatch(/Từ tiếng Anh của từ trên/);
        expect(sach).not.toMatch(/Nghĩa tiếng Việt của từ trên/);
        expect(sach).not.toMatch(/Nhập từ tiếng Anh/);
        expect(sach).not.toMatch(/Nhập nghĩa tiếng Việt/);
    });

    test('chiều thường hỏi MẶT ĐÁP', () => {
        expect(than).toMatch(/prompt: `\$\{ten\.nghia\} của từ trên là:`/);
    });

    test('đảo chiều hỏi MẶT HỎI', () => {
        // Đảo chiều thì hiện nghĩa, người dùng gõ từ — nên nhãn phải là mặt từ.
        expect(than).toMatch(/prompt: `\$\{ten\.tu\} của từ trên là:`/);
    });

    test('hai nhãn KHÁC nhau, không cùng một vế', () => {
        // Dùng nhầm cùng `ten.tu` cho cả hai nhánh thì chiều thường hỏi "Tiếng
        // Trung của từ trên là" trong khi đang cần nghĩa.
        expect(than).toMatch(/ten\.tu/);
        expect(than).toMatch(/ten\.nghia/);
    });

    test('ô nhập cũng theo mặt tương ứng', () => {
        expect(than).toMatch(/placeholder: `Nhập từ \$\{thuong\.tu\}`/);
        expect(than).toMatch(/placeholder: `Nhập \$\{thuong\.nghia\}`/);
    });

    test('lấy kho tại thời điểm SINH CÂU', () => {
        // Đọc một lần ở tầng module thì đổi kho xong câu hỏi vẫn giữ nhãn cũ.
        expect(than).toMatch(/const kho = vocabLang\(\)/);
    });
});

describe('câu ĐỒNG NGHĨA gọi đúng tên mặt', () => {
    test('không còn viết cứng "(tiếng Anh)"', () => {
        // Đồng nghĩa luôn cùng ngôn ngữ với TỪ đang học.
        const i = gl.indexOf('Chọn từ đồng nghĩa');
        expect(i).toBeGreaterThan(-1);
        expect(gl.slice(i - 80, i + 90)).toMatch(/nhanKhoThuong\(vocabLang\(\)\)\.tu/);
    });
});

describe('không còn chỗ nào viết cứng ngôn ngữ ở câu hỏi', () => {
    /** Chuỗi HIỆN RA MÀN HÌNH của các file sinh câu hỏi (đã bỏ comment). */
    const chuoiThat = (src) => src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((d) => d.replace(/\/\/.*/, '')).join('\n');

    test('`gameLogic` không còn "của từ trên là" kèm tên ngôn ngữ cứng', () => {
        const sach = chuoiThat(gl);
        expect(sach).not.toMatch(/'(Từ|Nghĩa) tiếng (Anh|Việt) của từ trên/);
    });

    test('mô tả thẻ chế độ ở trang chủ không gọi tên ngôn ngữ', () => {
        // `gameModes` là hằng ở tầng module, tính MỘT lần lúc nạp — không dùng
        // `vocabLang()` được, giá trị sẽ đóng băng. Nên viết trung tính.
        const home = chuoiThat(readFileSync(
            join(__dirname, '..', 'components', 'home', 'HomeScreen.jsx'), 'utf8'));
        const dong = home.split('\n').filter((d) => /desc: '/.test(d));
        expect(dong.length).toBeGreaterThan(5);
        for (const d of dong) {
            expect(d, d.trim()).not.toMatch(/tiếng Anh|tiếng Việt/);
        }
    });

    test('`dictation` không báo lỗi kèm tên ngôn ngữ', () => {
        const d = chuoiThat(readFileSync(
            join(__dirname, '..', 'components', 'practice', 'modes', 'dictation.js'), 'utf8'));
        expect(d).not.toMatch(/câu ví dụ tiếng Anh/);
    });

    test('thông báo đảo chiều gọi đúng hai mặt', () => {
        // Kho song ngữ không đi qua tiếng Việt — báo "hỏi bằng Tiếng Việt" ở đó
        // là sai hẳn.
        const qs = chuoiThat(readFileSync(
            join(__dirname, '..', 'layouts', 'QuickSettings.jsx'), 'utf8'));
        expect(qs).not.toMatch(/hỏi bằng Tiếng Việt/);
        expect(qs).toMatch(/const c = nhanKho\(vocabLang\)/);
    });

    test('lời nhắc "cần chữ Hán" nêu CẢ hai bộ dùng được', () => {
        const h = chuoiThat(readFileSync(
            join(__dirname, '..', 'components', 'practice', 'modes', 'hanziWriting.js'), 'utf8'));
        expect(h).toMatch(/Trung–Anh/);
    });
});

describe('mã giọng — cặp với bảng tên', () => {
    test('ba kho ba cặp mã', () => {
        expect(maKho('en')).toEqual({ tu: 'en-US', nghia: 'vi-VN' });
        expect(maKho('zh')).toEqual({ tu: 'zh-CN', nghia: 'vi-VN' });
        expect(maKho('bi')).toEqual({ tu: 'zh-CN', nghia: 'en-US' });
    });

    test('song ngữ đọc theo CHÍNH bản ghi', () => {
        expect(maKho('bi', { ttsLang: 'en-US' })).toEqual({ tu: 'en-US', nghia: 'zh-CN' });
    });
});
