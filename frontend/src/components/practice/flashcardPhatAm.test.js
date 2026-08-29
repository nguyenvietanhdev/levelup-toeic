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

    test('lật thẻ đọc mặt VỪA LẬT RA', () => {
        // Đây là chỗ chính người dùng nghe khi lật. Theo `this.isFlipped` chứ
        // không cứng `true`: lật về mặt trước cũng phải đọc — xem
        // `flashcardLatThe.test.js`.
        expect(src).toMatch(/this\.pronounce\(this\.chuMat\(currentWord, this\.isFlipped\)\)/);
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

describe('thẻ vừa khung nhìn, không che nội dung', () => {
    const css = readFileSync(join(
        __dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
    const rule = (sel) => {
        const i = css.indexOf(sel);
        expect(i).toBeGreaterThan(-1);
        return css.slice(css.indexOf('{', i), css.indexOf('}', i));
    };

    // `.flashcard {` khớp trúng `.flashcard-stage .flashcard {` đứng trước nó.
    // Neo bằng `perspective` — thuộc tính chỉ rule này có, và không phụ thuộc
    // kiểu xuống dòng (file lưu CRLF nên chuỗi chứa `\n` trần không khớp).
    const ruleThe = () => {
        const i = css.indexOf('perspective: 1000px');
        expect(i).toBeGreaterThan(-1);
        return css.slice(css.lastIndexOf('{', i), css.indexOf('}', i));
    };

    test('chiều cao CO GIÃN theo nội dung', () => {
        // 300px cố định đủ cho thẻ cũ, nhưng thẻ song ngữ có thêm phiên âm và
        // đồng nghĩa riêng cho mỗi mặt — nội dung vượt khung và bị cắt cụt.
        const r = ruleThe();
        expect(r).toMatch(/min-height: \d+px/);
        expect(r).not.toMatch(/^\s*height: 300px/m);
    });

    test('có TRẦN để không đẩy nút xuống dưới mép', () => {
        expect(ruleThe()).toMatch(/max-height: 78vh/);
    });

    test('nội dung bám mép TRÊN khi tràn', () => {
        // `center` dồn ra giữa, nên phần trên bị đẩy khỏi vùng cuộn và không
        // kéo lại được — đúng thứ người dùng thấy (chữ ở trên bị khuất).
        const i = css.indexOf('.flashcard-front,');
        const r = css.slice(css.indexOf('{', i), css.indexOf('}', i));
        expect(r).toMatch(/justify-content: flex-start/);
        expect(r).toMatch(/overflow-y: auto/);
    });

    test('nội dung NGẮN vẫn căn giữa cho cân', () => {
        // Neo vào `.card-extras` — khối bọc ví dụ + đồng nghĩa; `.card-example`
        // là tên cũ, từ hồi hai khối còn tách rời.
        expect(css).toMatch(/\.flashcard-front:not\(:has\(\.card-extras\)\)/);
        expect(css).toMatch(/justify-content: center/);
    });

    test('bỏ dòng "Click / Space" — nó ĐÈ lên nội dung', () => {
        // `position: absolute; bottom` nên nó nằm đúng chỗ khối "Từ đồng
        // nghĩa", chữ chồng lên nhau không đọc được.
        expect(src).not.toMatch(/Click \/ Space/);
        expect(css).not.toMatch(/^\.card-hint \{/m);
    });
});

describe('phiên âm hiện ở CẢ HAI mặt', () => {
    test('mặt sau không còn phụ thuộc `reversed`', () => {
        // Trước đây chỉ hiện khi đảo chiều — nên ở kho song ngữ chiều thường,
        // mặt EN không có phiên âm nào dù dữ liệu có sẵn.
        expect(src).not.toMatch(/\$\{reversed \? `[\s\S]{0,120}card-phonetic/);
    });

    test('lấy phiên âm từ bộ của CHÍNH mặt đó', () => {
        // `word.phonetic` đã bị chọn theo `hienThi`; đảo chiều là nó thuộc mặt
        // kia, hiện lên là phiên âm không khớp chữ đang nhìn.
        expect(src).toMatch(/laSongNgu\s*\?\s*boSau\.phonetic/);
        expect(src).toMatch(/laSongNgu\s*\?\s*boTruoc\.phonetic/);
    });

    test('hai kho cũ giữ hành vi cũ', () => {
        // Kho en/zh chỉ có một phiên âm, và mặt sau là nghĩa nên không hiện.
        expect(src).toMatch(/: \(reversed \? word\.phonetic : ''\)/);
        expect(src).toMatch(/: \(!reversed \? \(word\.phonetic \|\| ''\) : ''\)/);
    });
});

describe('gọn thẻ: nút tim lên góc, phiên âm cùng hàng loại từ', () => {
    const css2 = readFileSync(join(
        __dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
    const rule2 = (sel) => {
        const i = css2.indexOf(sel);
        expect(i).toBeGreaterThan(-1);
        return css2.slice(css2.indexOf('{', i), css2.indexOf('}', i));
    };

    test('nút tim nằm CẠNH badge, không giữa thân thẻ', () => {
        // Trước đây nó chiếm nguyên một hàng giữa thẻ.
        const i = src.indexOf('card-corner-group');
        expect(i).toBeGreaterThan(-1);
        const cum = src.slice(i, src.indexOf('</div>', src.indexOf('card-corner-badge', i)));
        expect(cum).toContain('card-fav-btn');
        expect(cum).toContain('card-corner-badge');
    });

    test('badge trong cụm thôi vị trí tuyệt đối', () => {
        // Cụm đã lo chỗ đứng; để `absolute` thì hai thứ chồng lên nhau.
        expect(rule2('.card-corner-group .card-corner-badge {')).toMatch(/position: static/);
    });

    test('mặt SAU cũng dùng cụm góc', () => {
        // Đổi từ badge độc lập sang cụm: nút tim nay có ở CẢ HAI mặt, lật sang
        // mặt kia vẫn đánh dấu được mà không phải lật về.
        // Cắt tới HẾT mặt sau thay vì đếm ký tự: cửa sổ cố định hỏng ngay khi
        // ai đó thêm một dòng comment ở giữa.
        const i = src.indexOf('flashcard-back');
        const t = src.slice(i, src.indexOf('card-content', i));
        expect(t).toMatch(/card-corner-group/);
        expect(t).toMatch(/class="card-corner-badge">\$\{backBadge\}/);
    });

    test('phiên âm và loại từ trên MỘT hàng', () => {
        expect(src).toMatch(/card-meta-row/);
        const i = src.indexOf('card-meta-row');
        const t = src.slice(i - 400, i + 300);
        expect(t).toMatch(/card-phonetic/);
        expect(t).toMatch(/card-type/);
    });

    test('hàng đó ẩn hẳn khi không có gì', () => {
        // Chừa một dải trống không hiểu vì sao lại có.
        expect(src).toMatch(/if \(!ph && !loai\) return ''/);
    });

    test('khoảng cách các dòng bớt rộng', () => {
        // Từ → phiên âm là cùng một cụm thông tin, không cần khoảng cách của
        // hai khối riêng.
        const i = css2.indexOf('.card-word,');
        expect(css2.slice(css2.indexOf('{', i), css2.indexOf('}', i)))
            .toMatch(/margin-bottom: var\(--spacing-sm\)/);
    });

    test('khối ví dụ không cộng khoảng cách hai lần', () => {
        // Container đã có `gap`; thêm `margin-top` là cộng lần hai.
        const i = css2.indexOf('.card-example,');
        expect(css2.slice(css2.indexOf('{', i), css2.indexOf('}', i)))
            .toMatch(/margin-top: 0/);
    });
});

describe('hai mặt trình bày GIỐNG nhau', () => {
    test('cùng dùng một hàm dựng hàng meta', () => {
        // Trước đây mặt sau không có hàng này nên hai mặt nhìn lệch hẳn — mà
        // mặt sau mới là bố cục người dùng thấy gọn.
        expect(src).toMatch(/const hangMeta = \(ph, loai\) =>/);
        expect((src.match(/\$\{hangMeta\(/g) || []).length).toBe(2);
    });

    test('loại từ ở mặt sau CHỈ khi là kho song ngữ', () => {
        // Hai mặt song ngữ đều là TỪ nên đều có loại. Ở hai kho cũ mặt sau là
        // NGHĨA, gắn loại từ vào đó là sai.
        expect(src).toMatch(/laSongNgu \? \(word\.type \|\| ''\) : ''/);
    });
});

describe('nút tim có ở CẢ HAI mặt', () => {
    test('mặt sau cũng có cụm góc + nút tim', () => {
        const i = src.indexOf('flashcard-back');
        const t = src.slice(i, i + 700);
        expect(t).toMatch(/card-corner-group/);
        expect(t).toMatch(/card-fav-btn/);
    });

    test('gắn sự kiện theo CLASS, không theo id', () => {
        // `getElementById` chỉ trả về MỘT — mặt sau bấm sẽ không có tác dụng.
        expect(src).toMatch(/querySelectorAll\('\.card-fav-btn'\)\.forEach/);
        const code = src.replace(/\/\/[^\n]*/g, '');
        expect(code).not.toMatch(/getElementById\('fav-btn'\)/);
    });

    test('cập nhật CẢ HAI nút sau khi bấm', () => {
        // Chỉ sửa một cái thì lật sang mặt kia thấy tim rỗng dù đã đánh dấu —
        // và bấm lần nữa là bỏ mất luôn.
        const i = src.indexOf('const nowFav = !isFav');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 400)).toMatch(/querySelectorAll\('\.card-fav-btn'\)\.forEach/);
    });

    test('chặn nổi bọt — bấm tim không làm lật thẻ', () => {
        const i = src.indexOf("querySelectorAll('.card-fav-btn').forEach");
        expect(src.slice(i, i + 300)).toMatch(/e\.stopPropagation\(\)/);
    });

    test('hai nút có id KHÁC nhau', () => {
        // Trùng id là HTML sai, và `getElementById` ở nơi khác sẽ bắt nhầm.
        expect(src).toMatch(/id="fav-btn"/);
        expect(src).toMatch(/id="fav-btn-sau"/);
    });
});
