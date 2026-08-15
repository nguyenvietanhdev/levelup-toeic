/**
 * Chuẩn hoá `type` (loại từ) — gộp các biến thể trùng nghĩa về một dạng.
 *
 * Kho tiếng Trung từng có 95 giá trị khác nhau cho một trường lẽ ra chỉ vài
 * chục. Ba loại lộn xộn cùng tồn tại, và cả ba đều hỏng IM LẶNG: dữ liệu vẫn
 * lưu được, ô lọc vẫn chạy, chỉ là cùng một loại từ nằm rải ra nhiều mục nên
 * lọc `动词/名词` sẽ SÓT 114 từ đang ghi `动词 / 名词`.
 *
 *   1. DẤU CÁCH quanh "/"
 *   2. THỨ TỰ các thành phần
 *   3. TỪ ĐỒNG NGHĨA (感叹词 / 叹词)
 */
const { normalizeWordType } = require('../utils/wordType');

describe('gộp biến thể trùng nghĩa (tiếng Trung)', () => {
    test('bỏ khoảng trắng quanh "/"', () => {
        expect(normalizeWordType('动词 / 名词')).toBe('名词/动词');
        expect(normalizeWordType('动词/名词')).toBe('名词/动词');
    });

    test('mọi hoán vị cùng ra MỘT chuỗi', () => {
        // `动词/名词` (151 từ) và `名词/动词` (36 từ) là một — không gộp thì lọc
        // cái này sót cái kia.
        const forms = ['动词/名词', '名词/动词', '动词 / 名词', '名词 / 动词'];
        const out = new Set(forms.map((f) => normalizeWordType(f)));
        expect(out.size).toBe(1);
        expect([...out][0]).toBe('名词/动词');
    });

    test('ba thành phần cũng sắp đúng thứ tự', () => {
        expect(normalizeWordType('形容词 / 动词 / 副词')).toBe('动词/形容词/副词');
        expect(normalizeWordType('副词 / 名词 / 形容词')).toBe('名词/形容词/副词');
    });

    test('gộp từ đồng nghĩa', () => {
        expect(normalizeWordType('感叹词')).toBe('叹词');
        expect(normalizeWordType('叹词')).toBe('叹词');
    });

    test('bỏ thành phần trùng lặp', () => {
        expect(normalizeWordType('动词/动词')).toBe('动词');
    });

    test('giá trị đơn giữ nguyên', () => {
        for (const v of ['名词', '动词', '形容词', '成语', '量词']) {
            expect(normalizeWordType(v)).toBe(v);
        }
    });

    test('loại LẠ không bị vứt đi, chỉ xếp cuối', () => {
        // Thà giữ giá trị không nhận ra còn hơn làm mất dữ liệu người dùng.
        expect(normalizeWordType('名词/xyz')).toBe('名词/xyz');
    });
});

describe('quy đổi nhãn tiếng Anh → chữ Hán (chỉ cho lang=zh)', () => {
    test('từ người dùng tải lên gộp chung mục với kho chung', () => {
        // Kho chung ghi `名词`, người dùng ghi `noun` — không quy đổi thì lọc
        // `名词` bỏ sót toàn bộ từ của người dùng, và ô lọc hiện hai mục riêng
        // cho cùng một loại từ.
        expect(normalizeWordType('noun', 'zh')).toBe('名词');
        expect(normalizeWordType('verb', 'zh')).toBe('动词');
        expect(normalizeWordType('adjective', 'zh')).toBe('形容词');
        expect(normalizeWordType('measure word', 'zh')).toBe('量词');
        expect(normalizeWordType('phrase', 'zh')).toBe('短语');
    });

    test('không phân biệt hoa/thường khi tra bảng', () => {
        expect(normalizeWordType('Noun', 'zh')).toBe('名词');
        expect(normalizeWordType('MEASURE WORD', 'zh')).toBe('量词');
    });

    test('tổ hợp lẫn hai hệ cũng gộp đúng', () => {
        expect(normalizeWordType('noun/动词', 'zh')).toBe('名词/动词');
    });

    test('tiếng ANH thì KHÔNG quy đổi', () => {
        // Từ tiếng Anh giữ `noun` — đó mới là hệ đúng của chúng.
        expect(normalizeWordType('noun', 'en')).toBe('noun');
        expect(normalizeWordType('verb', 'en')).toBe('verb');
    });

    test('nhãn tiếng Anh lạ không bị vứt, giữ nguyên', () => {
        expect(normalizeWordType('gerund', 'zh')).toBe('gerund');
    });
});

describe('nhãn KHÔNG phải từ loại thì giữ nguyên', () => {
    test('"bộ thủ" không bị tách hay sắp xếp', () => {
        // 483 từ trong kho zh dùng nhãn tiếng Việt này cho bộ thủ chữ Hán —
        // gộp nó vào bảng từ loại là sai nghĩa.
        expect(normalizeWordType('bộ thủ')).toBe('bộ thủ');
        expect(normalizeWordType('bộ thủ', 'en')).toBe('bộ thủ');
    });
});

describe('tiếng Anh', () => {
    test('viết thường ("Noun" và "noun" là một)', () => {
        expect(normalizeWordType('Noun', 'en')).toBe('noun');
        expect(normalizeWordType('NOUN', 'en')).toBe('noun');
    });

    test('cũng gộp thứ tự và dấu cách', () => {
        expect(normalizeWordType('verb / noun', 'en')).toBe('noun/verb');
        expect(normalizeWordType('noun/verb', 'en')).toBe('noun/verb');
    });

    test('chữ Hán KHÔNG bị hạ chữ thường (vô nghĩa với tiếng Trung)', () => {
        // Hạ chữ thường chuỗi Hán là no-op, nhưng gọi nhầm `lang` thì thứ tự
        // sắp xếp lấy bảng sai — kiểm cho chắc.
        expect(normalizeWordType('名词', 'zh')).toBe('名词');
    });
});

describe('đầu vào rác không làm sập', () => {
    test('rỗng / null / undefined → chuỗi rỗng', () => {
        for (const v of ['', '   ', null, undefined]) {
            expect(normalizeWordType(v)).toBe('');
        }
    });

    test('chỉ toàn dấu "/" → chuỗi rỗng', () => {
        expect(normalizeWordType('///')).toBe('');
    });

    test('idempotent — chạy hai lần ra cùng kết quả', () => {
        // Bắt buộc: script migration chạy lại lần hai không được đổi thêm gì.
        for (const v of ['动词 / 名词', '感叹词', 'bộ thủ', 'Noun', '名词/xyz']) {
            const once = normalizeWordType(v);
            expect(normalizeWordType(once)).toBe(once);
        }
    });
});

describe('script migration dùng CHUNG một bản', () => {
    test('normalize-zh-type.js gọi util, không tự chép logic', () => {
        // Chép làm hai bản thì dữ liệu mới lại lệch với dữ liệu vừa dọn.
        const fs = require('fs');
        const path = require('path');
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'scripts', 'normalize-zh-type.js'), 'utf8');
        expect(src).toMatch(/require\('\.\.\/utils\/wordType'\)/);
        expect(src).not.toMatch(/const ZH_ORDER = \[/);
    });

    test('uploadController chuẩn hoá lúc NHẬP, không chỉ lúc migrate', () => {
        const fs = require('fs');
        const path = require('path');
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8');
        expect(src).toMatch(/normalizeWordType\(type,/);
        // `lower(type)` cũ không xử lý được dấu cách/thứ tự cho tiếng Trung.
        expect(src).not.toMatch(/type: lower\(type\)/);
    });
});
