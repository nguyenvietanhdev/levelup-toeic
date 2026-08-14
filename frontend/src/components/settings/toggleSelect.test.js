/**
 * Lựa chọn bật/tắt trong Cài đặt dùng <select>, không phải nút gạt.
 *
 * Nút gạt chỉ hiện TRẠNG THÁI chứ không hiện lựa chọn: nhìn vào phải biết trước
 * "gạt sang phải nghĩa là bật" mới đọc được, và thường phải bấm thử mới chắc.
 * Select ghi thẳng "Bật"/"Tắt", và đồng bộ với các ô chọn khác trong cùng màn.
 *
 * Ba chỗ dễ hỏng im lặng:
 *   1. Đổi interface (`checked`/`onChange`) → 8 chỗ gọi phải sửa theo, sót một
 *      chỗ là nó im lặng không hoạt động.
 *   2. Không chặn "chọn lại đúng giá trị đang dùng" → nhiều `onChange` ghi
 *      settings rồi hiện thông báo, mỗi lần chạm là một thông báo thừa.
 *   3. Bỏ nút gạt mà để lại CSS của nó → mấy chục dòng mồ côi, người sau đọc
 *      tưởng vẫn còn dùng.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const toggle = strip(readFileSync(join(__dirname, 'panels', 'Toggle.jsx'), 'utf8'));
const css = readFileSync(join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const PANELS = ['GeneralPanel', 'PracticePanel', 'SoundPanel', 'ToeicExamPanel'];

describe('Toggle dùng <select>', () => {
    test('là select với hai lựa chọn ghi rõ chữ', () => {
        expect(toggle).toMatch(/<select/);
        expect(toggle).toMatch(/<option value="on">/);
        expect(toggle).toMatch(/<option value="off">/);
    });

    test('KHÔNG còn là checkbox / nút gạt', () => {
        expect(toggle).not.toMatch(/type="checkbox"/);
        expect(toggle).not.toMatch(/toggle-slider/);
    });

    test('nhãn mặc định là "Bật" / "Tắt", đổi được khi cần', () => {
        // Vài chỗ có thể muốn chữ khác ("Có"/"Không"…), nên cho phép truyền vào.
        expect(toggle).toMatch(/labels\?\.on \|\| 'Bật'/);
        expect(toggle).toMatch(/labels\?\.off \|\| 'Tắt'/);
    });
});

describe('giữ nguyên interface — mọi chỗ gọi không phải sửa', () => {
    test('vẫn nhận `checked` và gọi `onChange(boolean)`', () => {
        expect(toggle).toMatch(/\{ checked, onChange/);
        expect(toggle).toMatch(/onChange\(next\)/);
        expect(toggle).toMatch(/value=\{checked \? 'on' : 'off'\}/);
    });

    test('mọi panel vẫn gọi đúng khuôn cũ', () => {
        let count = 0;
        for (const name of PANELS) {
            const src = readFileSync(join(__dirname, 'panels', `${name}.jsx`), 'utf8');
            const hits = src.match(/<Toggle/g) || [];
            count += hits.length;
            // Không panel nào được truyền prop lạ kiểu `value=` hay `onToggle=`.
            expect(src, name).not.toMatch(/<Toggle[^>]*onToggle=/);
        }
        // KHÔNG chốt cứng một con số: thêm/bớt một mục cài đặt là test đỏ dù
        // chẳng có gì hỏng (đã dính đúng thế khi tách "Hiệu ứng âm thanh" thành
        // ba mục). Điều đáng giữ là mọi chỗ gọi dùng CHUNG một khuôn — số lượng
        // bao nhiêu là chuyện của thiết kế màn Cài đặt.
        expect(count).toBeGreaterThanOrEqual(8);
    });
});

describe('chọn lại giá trị đang dùng thì không làm gì', () => {
    test('có chặn trước khi gọi onChange', () => {
        // Nhiều `onChange` ghi settings rồi hiện thông báo — gọi thừa là một
        // thông báo thừa mỗi lần chạm.
        expect(toggle).toMatch(/if \(next !== checked\) onChange\(next\)/);
    });
});

describe('hàng nhiều điều khiển', () => {
    test('select bên trong cụm CO theo chỗ còn lại', () => {
        // Giữ 240px của riêng nó thì cụm phình gấp đôi. `!important` để thắng
        // quy tắc `.settings-section select` ở trên.
        const css2 = readFileSync(
            join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
        const m = css2.match(/\.setting-inline-group select\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/width:\s*auto\s*!important/);
        expect(m[1]).toMatch(/min-width:\s*0/);
    });
});

describe('RÀ SOÁT: mọi cụm điều khiển đều được phủ', () => {
    /** Mọi `<div style={{display:'flex'…}}` bọc nhiều điều khiển trong panel. */
    function inlineGroups(name) {
        const src = readFileSync(join(__dirname, 'panels', `${name}.jsx`), 'utf8');
        const out = [];
        const re = /<div([^>]*display: 'flex'[^>]*)>/g;
        let m;
        while ((m = re.exec(src)) !== null) {
            // Chỉ xét cụm nằm ngay sau nó có <select — tức là cột phải của một
            // hàng cài đặt, không phải khối bố cục chung.
            const after = src.slice(m.index, m.index + 400);
            if (!/<select/.test(after)) continue;
            // NGOẠI LỆ có chủ ý: hàng giọng đọc xếp DỌC và ô chọn trải hết bề
            // ngang, vì tên giọng dài gấp nhiều lần mọi nhãn khác. Ép 240px ở
            // đó là cắt mất tên chứ không phải làm cho đều.
            if (/flex: 1/.test(after)) continue;
            out.push(m[1]);
        }
        return out;
    }

    test('cụm nào có select cũng mang class `setting-inline-group`', () => {
        // Thiếu class thì mỗi select trong cụm tự lấy 240px và hàng đó rộng gấp
        // đôi/ba mọi hàng khác — đúng lỗi đã gặp hai lần.
        for (const name of PANELS) {
            for (const attrs of inlineGroups(name)) {
                expect(attrs, `${name}: cụm chứa select thiếu class`)
                    .toMatch(/setting-inline-group/);
            }
        }
    });

    test('hàng giọng đọc được MIỄN, và miễn một cách rõ ràng', () => {
        // Tên giọng dài gấp nhiều lần mọi nhãn khác ("Yunyang — Trưởng thành
        // (CN) 👨"). Ép 240px ở đó là cắt mất tên chứ không phải làm cho đều —
        // nên phải có quy tắc nói rõ, không để nó "tình cờ" thoát.
        expect(css).toMatch(/\.voice-select-row select\s*\{[^}]*width:\s*100%\s*!important/);
    });

    test('mọi panel dùng chung MỘT bộ quy tắc, không tự đặt width cho select', () => {
        // Đặt `style={{ width: … }}` thẳng trên <select> là inline, thắng mọi
        // quy tắc chung — và chỉ hàng đó lệch, rất khó thấy.
        for (const name of PANELS) {
            const src = readFileSync(join(__dirname, 'panels', `${name}.jsx`), 'utf8');
            const selects = src.match(/<select[\s\S]{0,220}?>/g) || [];
            for (const tag of selects) {
                // Ngoại lệ: hàng giọng đọc dùng `flex: 1` để trải hết bề ngang.
                if (/flex: 1/.test(tag)) continue;
                expect(tag, `${name}: select tự đặt width`).not.toMatch(/width:\s*\d/);
            }
        }
    });
});

describe('mobile: cụm cũng trải hết bề ngang', () => {
    const resp = readFileSync(
        join(__dirname, '..', '..', 'assets', 'styles', 'responsive.css'), 'utf8');

    test('cụm bỏ ghim 240px ở khổ điện thoại', () => {
        // Giữ 240px trên màn 360px là hàng đó hẹp hơn hẳn các hàng khác (chúng
        // đã `width: 100%`).
        expect(resp).toMatch(/\.setting-inline-group\s*\{[^}]*width:\s*100%/);
    });

    test('select trong cụm phải `!important` mới thắng bản desktop', () => {
        // Bản desktop đặt `width: auto !important`; không cùng mức thì select
        // giữ `auto` và co về đúng bề rộng chữ.
        expect(resp).toMatch(/\.setting-inline-group select\s*\{[^}]*width:\s*100%\s*!important/);
    });
});

describe('không để lại CSS mồ côi', () => {
    test('đã xoá quy tắc của nút gạt', () => {
        expect(css).not.toMatch(/\.toggle-switch\s*\{/);
        expect(css).not.toMatch(/\.toggle-slider\s*\{/);
    });

    /** Thân của bộ quy tắc dùng chung cho mọi select trong Cài đặt. */
    const sharedBox = () => {
        const m = css.match(
            /\.settings-section select,\s*\.settings-section \.quick-difficulty-selector select\s*\{([^}]*)\}/);
        expect(m, 'không tìm thấy bộ quy tắc dùng chung').toBeTruthy();
        return m[1];
    };

    test('MỌI select trong Cài đặt cùng một bề rộng', () => {
        // Không đặt thì mỗi ô rộng theo nội dung: "Bật" ngắn tũn, còn
        // "Yunyang — Trưởng thành (CN) 👨" dài gấp năm — cột phải răng cưa.
        const w = sharedBox().match(/width:\s*(\d+)px/)?.[1];
        expect(w).toBeTruthy();

        // Ô bật/tắt nằm NGAY TRONG bộ quy tắc trên (nhánh
        // `.quick-difficulty-selector`), nên không cần quy tắc riêng nữa —
        // trước đây `.toggle-select select` chỉ chép lại đúng con số đó.

        // Hàng có NHIỀU điều khiển (select + ô số + "/990") cũng phải rộng đúng
        // bằng đó — không ghim thì hàng ấy dài hơn mọi hàng khác.
        const grp = css.match(/\.setting-inline-group\s*\{([^}]*)\}/);
        expect(grp).toBeTruthy();

        // `\\s` chứ không `\s`: trong template literal, `\s` bị nuốt thành `s`
        // thường và regex đi tìm chuỗi "widths240px" — không bao giờ khớp.
        expect(grp[1]).toMatch(new RegExp(`width:\\s*${w}px`));
    });

    test('cùng bề rộng thôi CHƯA đủ — cao và cỡ chữ cũng phải khớp', () => {
        // Ô bật/tắt mượn class `.quick-difficulty-selector` của thanh nav, nên
        // nó kéo theo `padding: 3px 8px; font-size: 12px` của nav, còn select
        // thường không có quy tắc nào và dùng mặc định trình duyệt. Bằng nhau bề
        // ngang mà cái cao cái thấp thì vẫn là hai cỡ khác nhau.
        const box = sharedBox();
        expect(box, 'thiếu chiều cao chung').toMatch(/height:\s*\d+px/);
        expect(box, 'thiếu cỡ chữ chung').toMatch(/font-size:\s*\d+px/);
        // Ghim chiều cao mà quên `border-box` thì viền + padding cộng thêm vào,
        // ô có viền lại cao hơn ô không viền.
        expect(box, 'thiếu box-sizing').toMatch(/box-sizing:\s*border-box/);
    });

    test('ô số đứng cạnh select cũng cao bằng select', () => {
        // Cụm "Tùy chỉnh…" có <select> + <input type=number> nằm cạnh nhau; lệch
        // chiều cao thì so le ngay bên trong một hàng.
        const box = sharedBox();
        const h = box.match(/height:\s*(\d+)px/)?.[1];
        const num = css.match(/\.setting-inline-group input\[type="number"\][^{]*\{([^}]*)\}/);
        expect(num, 'ô số không có quy tắc chiều cao').toBeTruthy();
        expect(num[1]).toMatch(new RegExp(`height:\\s*${h}px`));
    });
});

describe('mobile: nút gạt không dính bản nén của thanh nav', () => {
    const resp = readFileSync(
        join(__dirname, '..', '..', 'assets', 'styles', 'responsive.css'), 'utf8');

    test('Cài đặt kéo ô bật/tắt về lại cỡ chữ chung', () => {
        // Đầu responsive.css nén MỌI `.quick-difficulty-selector select` xuống
        // `font-size: 10px` cho vừa thanh nav. Ô bật/tắt trong Cài đặt dùng
        // chung class đó nên dính theo — trong khi select thường cạnh nó vẫn
        // 14px.
        const m = resp.match(
            /\.settings-section \.quick-difficulty-selector select\s*\{([^}]*)\}/);
        expect(m, 'thiếu quy tắc gỡ bản nén của nav').toBeTruthy();
        expect(m[1]).toMatch(/font-size:\s*14px/);
        // `min-width: 70px` của nav cũng phải gỡ, không thì ô không co hết được.
        expect(m[1]).toMatch(/min-width:\s*0/);
    });
});
