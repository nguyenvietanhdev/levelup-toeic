/**
 * Số từ sai hiện trên thẻ đề, thẻ Part, và tab "Từ vựng sai".
 *
 * Mục đích của con số này là để người học CHỌN ĐỀ: nhìn vào biết đề nào còn
 * nhiều từ chưa thuộc mà học trước. Nên CẢ BA chỗ — thẻ đề, thẻ Part, tab "Từ
 * vựng sai" — đều hiện `canOn`: còn bao nhiêu từ TỚI HẠN phải ôn.
 *
 * Ban đầu thẻ đề và thẻ Part hiện `sai` (tổng đã từng sai) còn tab kia hiện
 * `canOn`. Hai nửa nghĩa khác nhau trên hai huy hiệu ĐỎE TRÔNG GIỐNG HỆT NHAU:
 * popup chọn đề báo "đã ôn xong" mà thẻ Part vẫn "26 sai" đỏ chói — người dùng
 * đọc ra MÂU THUẮN chứ không phải thông tin, và không biết tin bên nào.
 *
 * Một huy hiệu — đúng MỘT nghĩa, ở mọi màn.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modal = readFileSync(join(__dirname, 'TopicModal.jsx'), 'utf8');
const hook = readFileSync(join(__dirname, 'useTopics.js'), 'utf8');
const part = readFileSync(
    join(__dirname, '..', 'part', 'partSelector.js'), 'utf8');
const api = readFileSync(
    join(__dirname, '..', '..', '..', 'api', 'wrongWords.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('đếm ở SERVER, không đếm lại ở client', () => {
    test('API có `summary()`', () => {
        expect(api).toMatch(/async summary\(\)/);
        expect(api).toMatch(/\/api\/wrong-words\/summary/);
    });

    test('hỏng thì trả rỗng, không ném', () => {
        // Con số phụ trợ: hỏng thì ẩn đi chứ không được chặn màn chọn đề.
        const i = api.indexOf('async summary()');
        const than = api.slice(i, api.indexOf('\n    },', i));
        expect(than).toMatch(/\.catch\(\(\) => \(\{ theoNguon: \{\}, theoPart: \{\} \}\)\)/);
    });
});

describe('thẻ ĐỀ hiện số từ đã sai', () => {
    /** `soTuSaiCuaDe` dựng từ chính mã nguồn rồi gọi thật. */
    const soTuSaiCuaDe = (tuSai) => {
        const i = modal.indexOf('const soTuSaiCuaDe =');
        expect(i).toBeGreaterThan(-1);
        const than = modal.slice(i, modal.indexOf('\n  };', i) + 4);
        return new Function('tuSai', `${than}; return soTuSaiCuaDe;`)(tuSai);
    };

    test('cộng theo TẤT CẢ `sourceKeys` của đề', () => {
        // Một đề gom được nhiều nguồn; tra mỗi khoá đầu là bỏ sót từ sai của
        // những nguồn còn lại — con số nhỏ hơn thực tế mà không gì báo.
        const f = soTuSaiCuaDe({
            a: { sai: 3, canOn: 1 },
            b: { sai: 4, canOn: 2 },
        });
        expect(f({ sourceKeys: ['a', 'b'] })).toEqual({ sai: 7, canOn: 3 });
    });

    test('cộng CẢ hai con số, không chỉ một', () => {
        // Thiếu `canOn` thì thẻ không biết khi nào báo "đã ôn xong".
        const f = soTuSaiCuaDe({ a: { sai: 5, canOn: 0 } });
        expect(f({ sourceKeys: ['a'] })).toEqual({ sai: 5, canOn: 0 });
    });

    test('lùi về `source` khi không có `sourceKeys`', () => {
        const f = soTuSaiCuaDe({ x: { sai: 2, canOn: 2 } });
        expect(f({ source: 'x' })).toEqual({ sai: 2, canOn: 2 });
    });

    test('nguồn chưa có từ sai → 0, không phải NaN', () => {
        const f = soTuSaiCuaDe({});
        expect(f({ sourceKeys: ['a', 'b'] })).toEqual({ sai: 0, canOn: 0 });
        expect(f({})).toEqual({ sai: 0, canOn: 0 });
        expect(f(null)).toEqual({ sai: 0, canOn: 0 });
    });

    test('không có từ sai nào thì không hiện gì', () => {
        expect(modal).toMatch(/soTuSaiCuaDe\(topic\)\.sai > 0 && \(/);
    });

    test('hiện `canOn`, cùng chữ với hai màn kia', () => {
        expect(modal).toMatch(/soTuSaiCuaDe\(topic\)\.canOn > 0 \?/);
        expect(modal).toMatch(/còn \{soTuSaiCuaDe\(topic\)\.canOn\} cần ôn/);
    });
});

describe('tab "Từ vựng sai" hiện số CÒN PHẢI ÔN', () => {
    test('dùng `canOn`, không phải tổng đã sai', () => {
        // Tổng đã sai chỉ nói quá khứ; `canOn` nói việc đang chờ.
        expect(modal).toMatch(/g\.canOn > 0 \? `còn \$\{g\.canOn\} cần ôn`/);
    });

    test('hết hạn ôn thì ghi rõ "đã ôn xong"', () => {
        // Để trống trông như lỗi tải.
        expect(modal).toMatch(/đã ôn xong/);
    });

    test('`canOn` lấy từ server theo từng nguồn', () => {
        expect(hook).toMatch(/canOn: theoNguon\[source\]\?\.canOn \?\? 0/);
    });

    test('xếp đề theo số CÒN PHẢI ÔN', () => {
        // Đó là thứ người dùng đang tìm khi mở tab này.
        expect(hook).toMatch(/\(b\.canOn - a\.canOn\)/);
    });
});

describe('nạp số từ sai cho MỌI tab', () => {
    test('có `loadTuSai` riêng, không nấp trong `loadWrong`', () => {
        // Chỉ `loadWrong` đặt số này thì thẻ đề ở tab "Chung"/"Riêng" không bao
        // giờ hiện được, trừ khi người dùng tình cờ mở tab kia trước.
        expect(hook).toMatch(/const loadTuSai = useCallback/);
    });

    test('gọi ngay khi MỞ popup', () => {
        const i = modal.indexOf('if (!open) return;');
        expect(i).toBeGreaterThan(-1);
        expect(modal.slice(i, i + 400)).toMatch(/loadTuSai\(\)/);
    });

    test('`loadTuSai` nằm trong deps của effect đó', () => {
        // Thiếu thì lint cảnh báo và closure có thể giữ bản cũ.
        expect(modal).toMatch(/\}, \[open, loadShared, loadTuSai, onClose\]\)/);
    });

    test('chưa đăng nhập thì rỗng, không gọi API', () => {
        const i = hook.indexOf('const loadTuSai = useCallback');
        const than = hook.slice(i, hook.indexOf('\n    }, []);', i));
        expect(than).toMatch(/if \(!getToken\(\)\)/);
    });
});

describe('thẻ PART hiện số từ đã sai', () => {
    test('có hàm đếm riêng, trả CẢ hai con số', () => {
        expect(part).toMatch(/soTuSai\(part\) \{/);
        expect(part).toMatch(/sai: o\?\.sai \|\| 0, canOn: o\?\.canOn \|\| 0/);
    });

    test('nạp SONG SONG, không chặn việc mở popup', () => {
        // `await` ở đó là popup đứng chờ mạng mới hiện, cho một con số phụ trợ.
        const i = part.indexOf('showPartSelectionModal()');
        const than = part.slice(i, i + 1200);
        expect(than).toMatch(/WrongWordsAPI\.summary\(\)\.then\(/);
        expect(than).not.toMatch(/await WrongWordsAPI\.summary/);
    });

    test('chỉ vẽ lại khi popup CÒN mở', () => {
        // Đóng trước lúc mạng về thì `renderModal` ghi vào `.modal-body` của
        // popup KHÁC đang mở.
        const i = part.indexOf('WrongWordsAPI.summary()');
        expect(part.slice(i, i + 500)).toMatch(/if \(!this\._modalOpen\) return;/);
    });

    test('không có từ sai nào thì không hiện gì', () => {
        // Hiện "đã ôn xong" trên mọi Part chưa từng sai là nhiễu.
        expect(part).toMatch(/if \(!sai\) return '';/);
    });

    test('hiện CÙNG con số với popup chọn đề — `canOn`', () => {
        // Đây là mâu thuẫn người dùng báo: popup chọn đề báo "đã ôn xong" mà
        // thẻ Part vẫn "26 sai" đỏ chói. Hai nửa nghĩa khác nhau trên hai huy
        // hiệu trông giống hệt nhau thì đọc ra mâu thuẫn, không phải thông tin.
        expect(part).toMatch(/canOn > 0/);
        expect(part).toMatch(/còn \$\{canOn\} cần ôn/);
    });

    test('hết hạn ôn thì báo "đã ôn xong", cùng chữ với popup kia', () => {
        expect(part).toMatch(/đã ôn xong/);
        expect(part).toMatch(/wrong-count is-done/);
    });

    test('KHÔNG còn hiện tổng `sai` trên thẻ', () => {
        // Tổng đã sai chỉ nói quá khứ; nó không giúp chọn Part nào để học.
        expect(part).not.toMatch(/\$\{this\.soTuSai\(part\)\} sai/);
    });
});

describe('kiểu hiển thị', () => {
    test('có lớp `.wrong-count`', () => {
        expect(css).toMatch(/\.wrong-count \{/);
    });

    test('màu khác con số tổng bên cạnh', () => {
        // Hai số cùng màu thì đọc thành một cặp vô nghĩa ("496 12").
        const i = css.indexOf('.wrong-count {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/color: var\(--error-color/);
    });

    test('ôn xong thì đổi màu, không còn là cảnh báo', () => {
        expect(css).toMatch(/\.wrong-count\.is-done \{/);
    });
});

describe('hai popup KHÔNG được nói ngược nhau', () => {
    test('thẻ ĐỀ cũng dựa trên `canOn`', () => {
        // Chỗ thứ ba cùng loại huy hiệu — bỏ sót thì mâu thuẫn lặp lại y hệt,
        // chỉ ở một tab khác.
        expect(modal).toMatch(/soTuSaiCuaDe\(topic\)\.canOn > 0 \?/);
    });

    test('cả hai cùng dựa trên `canOn`', () => {
        // Người dùng nhìn hai màn này cạnh nhau để quyết định học gì. Một bên
        // báo xong, một bên báo đỏ thì không biết tin bên nào.
        expect(modal).toMatch(/g\.canOn > 0/);
        expect(part).toMatch(/canOn > 0/);
    });

    test('cùng một cách nói', () => {
        for (const src of [modal, part]) {
            expect(src).toMatch(/cần ôn/);
            expect(src).toMatch(/đã ôn xong/);
        }
    });

    test('cùng một lớp CSS cho trạng thái xong', () => {
        // Khác lớp là khác màu, và hai màn lại trông như nói hai chuyện.
        expect(modal).toMatch(/wrong-count\$\{g\.canOn > 0 \? "" : " is-done"\}/);
        expect(part).toMatch(/wrong-count is-done/);
    });
});
