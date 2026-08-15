/**
 * Suy ngôn ngữ của từ vựng từ CHÍNH NỘI DUNG, không tin hoàn toàn vào client.
 *
 * Prompt AI có dặn ghi đúng `lang`, nhưng AI vẫn ghi nhầm — kho từng có 19 từ
 * chữ Hán (你, 好, 老师, 谢谢…) mang `lang: 'en'`.
 *
 * Hỏng IM LẶNG, hai hậu quả:
 *   - TTS đọc chữ Hán bằng giọng TIẾNG ANH.
 *   - Bộ đó không hiện ra khi người dùng đang học tiếng Trung.
 *
 * Test đọc mã nguồn controller: hàm là nội bộ, không export.
 */
const fs = require('fs');
const path = require('path');

const controller = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8');

/** Dựng lại hàm từ chính mã nguồn — chạy thật, không chỉ so chuỗi. */
function loadResolveLang() {
    const hanSrc = controller.match(/const hasHan = [^;]+;/);
    const fnSrc = controller.match(/const resolveLang = \(lang, word\) => \{[\s\S]*?\n\};/);
    if (!hanSrc) throw new Error('Không tìm thấy `hasHan` trong uploadController.js');
    if (!fnSrc) throw new Error('Không tìm thấy `resolveLang` trong uploadController.js');
    // eslint-disable-next-line no-new-func
    return new Function(`${hanSrc[0]}\n${fnSrc[0]}\nreturn resolveLang;`)();
}

const resolveLang = loadResolveLang();

describe('nội dung thắng nhãn client', () => {
    test('chữ Hán → zh, dù client khai en', () => {
        // Đây là lỗi thật đã gặp: 19 từ ở bộ `hocgiaotiep`.
        for (const w of ['你', '好', '老师', '谢谢', '你们', '不客气']) {
            expect(resolveLang('en', w)).toBe('zh');
        }
    });

    test('client khai gì cũng không đổi được sự thật', () => {
        expect(resolveLang('en', '名词')).toBe('zh');
        expect(resolveLang(undefined, '汉语')).toBe('zh');
        expect(resolveLang('xyz', '汉语')).toBe('zh');
    });
});

describe('không suy ngược', () => {
    test('không có chữ Hán mà client khai zh thì VẪN zh', () => {
        // Tiếng Trung viết bằng pinyin ("nǐ hǎo") là hợp lệ — đổi bừa sang 'en'
        // là hỏng thêm một nhóm khác.
        expect(resolveLang('zh', 'ni hao')).toBe('zh');
        expect(resolveLang('zh', 'nǐ hǎo')).toBe('zh');
    });

    test('từ tiếng Anh giữ nguyên en', () => {
        expect(resolveLang('en', 'hello')).toBe('en');
        expect(resolveLang('en', 'would like + to v')).toBe('en');
    });
});

describe('giá trị lạ không lọt vào DB', () => {
    test('chỉ trả về đúng hai giá trị', () => {
        // Giá trị lạ lọt vào là TTS đọc bằng giọng không tồn tại.
        for (const v of ['fr', '', null, undefined, 'ZH', 123]) {
            expect(['en', 'zh']).toContain(resolveLang(v, 'hello'));
        }
    });

    test('từ rỗng không làm sập', () => {
        expect(() => resolveLang('en', '')).not.toThrow();
        expect(() => resolveLang('en', null)).not.toThrow();
        expect(resolveLang('en', null)).toBe('en');
    });
});

describe('được dùng ở đường nhập từ', () => {
    test('uploadController gọi resolveLang, không gán thẳng', () => {
        expect(controller).toMatch(/lang: resolveLang\(lang, enL\)/);
        // Bản cũ tin hoàn toàn vào client.
        expect(controller).not.toMatch(/lang: lang === 'zh' \? 'zh' : 'en'/);
    });
});
