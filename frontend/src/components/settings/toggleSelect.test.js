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

describe('giữ nguyên interface — 8 chỗ gọi không phải sửa', () => {
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
        expect(count).toBe(8);
    });
});

describe('chọn lại giá trị đang dùng thì không làm gì', () => {
    test('có chặn trước khi gọi onChange', () => {
        // Nhiều `onChange` ghi settings rồi hiện thông báo — gọi thừa là một
        // thông báo thừa mỗi lần chạm.
        expect(toggle).toMatch(/if \(next !== checked\) onChange\(next\)/);
    });
});

describe('không để lại CSS mồ côi', () => {
    test('đã xoá quy tắc của nút gạt', () => {
        expect(css).not.toMatch(/\.toggle-switch\s*\{/);
        expect(css).not.toMatch(/\.toggle-slider\s*\{/);
    });

    test('select có bề rộng cố định để các dòng thẳng hàng', () => {
        // `auto` thì "Bật" và "Tắt" cho hai bề rộng khác nhau, cột phải răng cưa.
        expect(css).toMatch(/\.toggle-select select\s*\{[^}]*width:\s*\d+px/);
    });
});
