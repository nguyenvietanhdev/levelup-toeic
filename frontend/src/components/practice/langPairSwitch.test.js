/**
 * Nút đổi cặp học trên thanh luyện tập.
 *
 * Trước đây đổi chiều hỏi–đáp phải thoát ra vào Settings — mà đó là hai lựa
 * chọn nằm hai chỗ khác nhau ("ngôn ngữ học" và "chiều luyện tập"), trong khi
 * người dùng nghĩ theo CẶP: "Trung sang Việt", "Trung sang Anh".
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'LangPairSwitch.jsx'), 'utf8');
const screen = readFileSync(join(__dirname, 'PracticeScreen.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('gắn đúng chỗ', () => {
    test('nằm trên thanh luyện tập', () => {
        expect(screen).toMatch(/<LangPairSwitch \/>/);
        expect(screen).toMatch(/import \{ LangPairSwitch \}/);
    });

    test('đặt TRONG `practice-header`', () => {
        const i = screen.indexOf('practice-header');
        const j = screen.indexOf('<LangPairSwitch />');
        expect(j).toBeGreaterThan(i);
    });
});

describe('ghi lựa chọn ra CẢ hai nơi', () => {
    test('localStorage cho `isReversed()` đọc đồng bộ', () => {
        // `gameLogic.isReversed()` đọc thẳng localStorage, không qua state.
        expect(src).toMatch(/localStorage\.setItem\('reverseMode'/);
    });

    test('GameState để đồng bộ lên server', () => {
        // Thiếu vế này thì máy khác không thấy lựa chọn.
        expect(src).toMatch(/settings\.reverseMode = daoMoi/);
        expect(src).toMatch(/GameState\.save\?\.\(\)/);
    });

    test('ghi localStorage có bọc try — chế độ riêng tư chặn là ném lỗi', () => {
        expect(src).toMatch(/try \{ localStorage\.setItem/);
    });
});

describe('nhãn theo ĐÚNG kho đang dùng', () => {
    test('kho song ngữ đối chiếu với EN, không phải VN', () => {
        // `bi` học Trung ↔ Anh, không đi qua tiếng Việt.
        const i = src.indexOf('const TEN_DAP');
        expect(src.slice(i, i + 120)).toMatch(/bi: 'EN'/);
    });

    test('hai kho cũ vẫn đối chiếu VN', () => {
        const i = src.indexOf('const TEN_DAP');
        const t = src.slice(i, i + 120);
        expect(t).toMatch(/en: 'VN'/);
        expect(t).toMatch(/zh: 'VN'/);
    });
});

describe('không hứa thứ làm không được', () => {
    test('CHỈ đổi chiều, không đổi kho', () => {
        // Đổi kho phải reload trang (kho từ nạp lúc khởi động). Trộn hai thứ
        // có chi phí khác hẳn nhau vào một danh sách thì có mục bấm xong đổi
        // ngay, có mục nạp lại cả trang — cùng một nút mà hai hành vi.
        expect(src).not.toMatch(/vocabLang\s*=|location\.reload/);
    });

    test('nói rõ đổi kho ở đâu', () => {
        expect(src).toMatch(/Đổi bộ từ vựng ở trang chủ/);
    });

    test('báo rõ áp dụng từ câu SAU', () => {
        // `isReversed()` đọc lúc SINH câu hỏi nên câu đang hiện giữ nguyên.
        // Không nói thì người dùng tưởng bấm hỏng.
        expect(src).toMatch(/áp dụng từ câu sau/);
    });
});

describe('menu không kẹt trên màn hình', () => {
    test('bấm ra ngoài thì đóng', () => {
        expect(src).toMatch(/mousedown/);
        expect(src).toMatch(/boc\.current\?\.contains/);
    });

    test('hoãn gắn listener một nhịp', () => {
        // Gắn ngay trong lượt bấm hiện tại thì chính cú bấm mở danh sách lại
        // đóng nó luôn — bấm không ra gì.
        // Soi ĐÚNG dòng gắn listener, không phải "có chữ setTimeout quanh đây":
        // comment giải thích cũng nhắc nó, nên cửa sổ rộng thì bỏ hẳn
        // `setTimeout` đi test vẫn xanh.
        const code = src.replace(/\/\/[^\n]*/g, '');
        expect(code).toMatch(/setTimeout\(\(\) => document\.addEventListener\('mousedown'/);
    });

    test('gỡ listener khi đóng', () => {
        expect(src).toMatch(/removeEventListener\('mousedown'/);
    });

    test('menu neo PHẢI, không tràn màn hình', () => {
        const i = css.indexOf('.lang-pair-menu {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/right: 0/);
    });

    test('nổi trên khối kết quả', () => {
        const i = css.indexOf('.lang-pair-menu {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/z-index/);
    });
});
