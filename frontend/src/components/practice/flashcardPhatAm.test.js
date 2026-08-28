/**
 * Flashcard: đọc ĐÚNG mặt đang hiện, bằng ĐÚNG giọng.
 *
 * Ba lỗi chồng nhau trước đây:
 *   · `pronounce()` truyền cứng 'en-US' → kho song ngữ đặt chữ Hán vào
 *     `word.en` nên đọc bằng giọng Mỹ, ra một tràng vô nghĩa.
 *   · Mọi lời gọi đều đọc `word.en` → đảo chiều thì lật ra nghĩa mà loa đọc từ.
 *   · Nhãn góc thẻ cứng EN/VI → kho song ngữ mặt sau là tiếng Anh mà ghi "VI".
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'modes', 'flashcard.js'), 'utf8');

/**
 * Bản sao luật `chuMat` để chạy thật các ca.
 *
 * Module thật là singleton dính DOM nên không import lẻ được. Bản sao chứng
 * minh THUẬT TOÁN đúng; ca "khớp với hàm thật" ngay dưới chốt rằng file thật
 * vẫn dùng đúng công thức đó — thiếu nó thì sửa hàm thật mà test vẫn xanh.
 */
const chuMat = (word, matSau, dao) => {
    const nghia = word.vi || word.vn || '';
    return (dao !== matSau) ? nghia : word.en;
};

describe('chọn đúng mặt để đọc', () => {
    // Kho song ngữ: mapper đặt chữ Hán vào `en`, tiếng Anh vào `vn`.
    const bi = { en: '你好', vn: 'hello' };
    const en = { en: 'caterer', vn: 'người cung cấp đồ ăn' };

    test('chiều thường: trước = từ, sau = nghĩa', () => {
        expect(chuMat(en, false, false)).toBe('caterer');
        expect(chuMat(en, true, false)).toBe('người cung cấp đồ ăn');
    });

    test('đảo chiều: hai mặt đổi chỗ', () => {
        expect(chuMat(en, false, true)).toBe('người cung cấp đồ ăn');
        expect(chuMat(en, true, true)).toBe('caterer');
    });

    test('kho song ngữ: mặt sau là tiếng Anh, không phải tiếng Việt', () => {
        expect(chuMat(bi, false, false)).toBe('你好');
        expect(chuMat(bi, true, false)).toBe('hello');
    });

    test('thiếu nghĩa thì trả rỗng, không vỡ', () => {
        expect(chuMat({ en: 'x' }, true, false)).toBe('');
    });

    test('hàm THẬT dùng đúng công thức trên', () => {
        // Bản sao ở đầu file chỉ chứng minh thuật toán; không chốt lại thì sửa
        // `chuMat` trong file thật mà mọi ca trên vẫn xanh.
        const i = src.indexOf('chuMat(word, matSau = false)');
        expect(i).toBeGreaterThan(-1);
        const t = src.slice(i, src.indexOf('    },', i));
        expect(t).toMatch(/const dao = GameLogic\.isReversed\(\)/);
        expect(t).toMatch(/word\.vi \|\| word\.vn \|\| ''/);
        expect(t).toMatch(/\(dao !== matSau\) \? nghia : word\.en/);
    });
});

describe('không truyền cứng ngôn ngữ', () => {
    test('`pronounce` để `speakWord` tự nhận diện', () => {
        // Truyền 'en-US' là ghi đè mất phần nhận diện hệ chữ.
        // Bỏ comment trước khi soi: chính comment giải thích cũng nhắc 'en-US'.
        const i = src.indexOf('    pronounce(text) {');
        const t = src.slice(i, src.indexOf('\n    },', i)).replace(/\/\/[^\n]*/g, '');
        expect(t).toMatch(/GameLogic\.speakWord\(text\);/);
        expect(t).not.toMatch(/'en-US'/);
    });

    test('KHÔNG còn lời gọi nào truyền `word.en` trần', () => {
        // Bốn chỗ cũ đều đọc `word.en` bất kể chiều.
        const code = src.replace(/\/\/[^\n]*/g, '');
        expect(code).not.toMatch(/this\.pronounce\([^)]*\.en\)/);
    });
});

describe('mọi lối đọc đều qua `chuMat`', () => {
    const soLan = (re) => (src.match(re) || []).length;

    test('lật thẻ đọc MẶT SAU', () => {
        // Đây là chỗ chính người dùng nghe khi lật.
        expect(src).toMatch(/this\.pronounce\(this\.chuMat\(currentWord, true\)\)/);
    });

    test('tự phát âm lúc hiện thẻ đọc mặt TRƯỚC', () => {
        expect(src).toMatch(/this\.pronounce\(this\.chuMat\(word\)\), 500/);
    });

    test('nút loa và phím P đọc mặt ĐANG hiện', () => {
        expect(src).toMatch(/this\.chuMat\(word, this\.isFlipped\)/);
        expect(src).toMatch(/this\.chuMat\(this\.words\[this\.currentIndex\], this\.isFlipped\)/);
    });

    test('cả năm lối đọc đều dùng `chuMat`', () => {
        expect(soLan(/this\.pronounce\(/g)).toBe(5);
        expect(soLan(/this\.pronounce\(this\.chuMat\(/g)).toBe(5);
    });

    test('tự phát âm KHÔNG còn bỏ qua khi đảo chiều', () => {
        // Trước đây bỏ hẳn vì mặt trước là tiếng Việt mà chỉ có giọng Anh/Trung.
        const i = src.indexOf('autoPronunciation');
        expect(src.slice(i - 100, i + 120)).not.toMatch(/&& !reversed/);
    });
});

describe('nhãn góc thẻ theo cặp đang học', () => {
    test('không còn cứng EN/VI', () => {
        expect(src).not.toMatch(/frontBadge = reversed \? 'VI' : 'EN'/);
        expect(src).not.toMatch(/backBadge = reversed \? 'EN' : 'VI'/);
    });

    test('lấy từ `nhanCapHoc`, dùng chung với các chế độ khác', () => {
        expect(src).toMatch(/import \{ nhanCapHoc \}/);
        expect(src).toMatch(/const \{ tu, nghia \} = nhanCapHoc\(\)/);
    });

    test('có nhãn ZH cho kho tiếng Trung / song ngữ', () => {
        expect(src).toMatch(/'Tiếng Trung': 'ZH'/);
    });
});

describe('kho song ngữ: mỗi mặt một bộ ĐẦY ĐỦ', () => {
    test('mapper trả hai bộ riêng', () => {
        const mapper = readFileSync(join(
            __dirname, '..', '..', '..', '..', 'backend', 'services', 'vocabBiMapper.js'), 'utf8');
        expect(mapper).toMatch(/matZh: \{/);
        expect(mapper).toMatch(/matEn: \{/);
        // Mỗi bộ đủ: từ + phiên âm + ví dụ + đồng nghĩa của CHÍNH ngôn ngữ đó.
        const i = mapper.indexOf('matZh: {');
        const t = mapper.slice(i, mapper.indexOf('},', i));
        for (const f of ['tu:', 'phonetic:', 'example:', 'synonyms:']) expect(t).toContain(f);
    });

    test('các trường CŨ không đổi — 16 chế độ vẫn đọc được', () => {
        const mapper = readFileSync(join(
            __dirname, '..', '..', '..', '..', 'backend', 'services', 'vocabBiMapper.js'), 'utf8');
        // Đây là dữ liệu THÊM, không phải thay thế.
        expect(mapper).toMatch(/en: laZh \? d\.zh : d\.en/);
        expect(mapper).toMatch(/vn: laZh \? d\.en : d\.zh/);
    });

    test('CHỈ áp dụng cho kho song ngữ', () => {
        // Hai kho cũ giữ bố cục "từ ở trước, nghĩa + ví dụ ở sau": ví dụ ở đó
        // chỉ có MỘT thứ tiếng nên tách đôi là chép thừa.
        expect(src).toMatch(/const laSongNgu = !!word\.songNgu && !!word\.matZh && !!word\.matEn/);
        expect(src).toMatch(/const phuTruoc = laSongNgu \?/);
    });

    test('đảo chiều thì hai bộ đổi chỗ', () => {
        expect(src).toMatch(/boTruoc = laSongNgu \? \(reversed \? word\.matEn : word\.matZh\)/);
        expect(src).toMatch(/boSau = laSongNgu \? \(reversed \? word\.matZh : word\.matEn\)/);
    });

    test('mặt TRƯỚC cũng có khối ví dụ/đồng nghĩa', () => {
        // Trước đây chỉ mặt sau có.
        expect(src).toMatch(/\$\{phuTruoc\}/);
        expect(src).toMatch(/\$\{phuSau\}/);
    });

    test('hai mặt có id phiên âm RIÊNG', () => {
        // Cùng id thì `napPhienAm` ghi vào phần tử đầu tiên tìm thấy — tức mặt
        // kia, và một mặt mất phiên âm.
        expect(src).toMatch(/khoiPhu\(boTruoc\.example, boTruoc\.synonyms, '-truoc'\)/);
        expect(src).toMatch(/khoiPhu\(boSau\.example, boSau\.synonyms, '-sau'\)/);
    });

    test('nút loa đọc THẲNG nội dung, không tra lại theo khoá', () => {
        // Kho song ngữ có hai bộ; tra `word.example` luôn ra bộ của mặt kia.
        const i = src.indexOf(".card-speak')");
        const t = src.slice(i, i + 500);
        expect(t).toMatch(/const text = btn\.dataset\.speak;/);
        expect(t).not.toMatch(/dataset\.speak === 'example'/);
    });

    test('phiên âm quét theo phần tử ĐANG CÓ, không gõ cứng hai khoá', () => {
        // Song ngữ dựng 4 ô, hai kho cũ dựng 2 ô không hậu tố.
        // Cắt XUÔI từ chỗ khai hàm: `pronounceText` nằm TRƯỚC `napPhienAm`
        // trong file, nên lấy nó làm mốc kết thúc cho ra chuỗi rỗng và test
        // xanh mà chẳng kiểm gì.
        const i = src.indexOf('napPhienAm(word) {');
        expect(i).toBeGreaterThan(-1);
        const t = src.slice(i, src.indexOf('\n    },', i));
        expect(t).toMatch(/querySelectorAll\('\[id\^="fc-ph-"\]'\)/);
        expect(t).not.toMatch(/\['example', word\.example\]/);
    });
});
