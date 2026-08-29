/**
 * Chế độ Nối từ: phát âm cả hai cột, và màu nền chỉ báo KẾT QUẢ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'modes', 'matching.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Thân rule CSS đầu tiên khớp selector. */
const rule = (sel) => {
    const i = css.indexOf(sel);
    expect(i).toBeGreaterThan(-1);
    return css.slice(css.indexOf('{', i), css.indexOf('}', i));
};

describe('phát âm CẢ HAI cột', () => {
    test('cột phải cũng mang `data-word`', () => {
        // Trò này là nối hai bên với nhau nên bên nào cũng đáng nghe — nhất là
        // kho song ngữ, nơi cột phải là tiếng Anh chứ không phải nghĩa Việt.
        const i = src.indexOf("data-side=\"right\"");
        expect(src.slice(i, i + 250)).toMatch(/matching-word-text" data-word=/);
    });

    test('handler KHÔNG còn giới hạn ở cột trái', () => {
        const i = src.indexOf('items.forEach');
        const t = src.slice(i, src.indexOf('this.selectItem(', i));
        expect(t).not.toMatch(/if \(side === 'left'\)/);
        expect(t).toMatch(/GameLogic\.speakWord\(wordEl\.dataset\.word\)/);
    });

    test('KHÔNG truyền cứng ngôn ngữ', () => {
        // `speakWord` tự nhận diện hệ chữ; truyền 'en-US' thì cột chữ Hán bị
        // đọc bằng giọng Mỹ.
        // Bỏ comment trước khi soi: chính comment giải thích cũng nhắc 'en-US'.
        const i = src.indexOf('items.forEach');
        const t = src.slice(i, src.indexOf('this.selectItem(', i)).replace(/\/\/[^\n]*/g, '');
        expect(t).not.toMatch(/'en-US'/);
    });
});

describe('màu nền chỉ báo KẾT QUẢ, không báo lựa chọn', () => {
    test('`selected` chỉ có VIỀN, không tô nền', () => {
        // Nền đặc trông y hệt `.matched`, nhìn lướt là tưởng đã nối xong.
        const r = rule('.matching-item.selected {');
        expect(r).toMatch(/border-color/);
        expect(r).not.toMatch(/background-color/);
    });

    test('`matched` VẪN tô nền — đó mới là kết quả', () => {
        const r = rule('.matching-item.matched {');
        expect(r).toMatch(/background-color: var\(--success-color\)/);
    });

    test('chọn SAI thì gỡ luôn dấu chọn', () => {
        // Thiếu vế này thì sau vài lần sai, nửa bảng sáng lên và không phân
        // biệt được ô đang chọn với ô từng bấm nhầm.
        // Neo vào chỗ GỠ, không phải chỗ thêm class: `animate-shake` xuất hiện
        // trước ở hai dòng `classList.add`, và cửa sổ tính từ đó không tới nơi.
        expect(src).toMatch(/remove\('animate-shake', 'selected'\)/);
    });

    test('bắt phần tử ra biến TRƯỚC khi hẹn giờ', () => {
        // `this.selectedLeft` bị đặt `null` ngay cuối hàm; callback chạy 400ms
        // sau thì `?.` nuốt luôn và không gỡ được gì.
        const i = src.indexOf('const oTrai = this.selectedLeft');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 300)).toMatch(/setTimeout/);

        // Và phải đứng trước chỗ gán null CỦA CÙNG HÀM `checkMatch` — dùng
        // `indexOf` trần thì bắt trúng lần gán ở `loadBatch` phía trên file.
        const iNull = src.indexOf('this.selectedLeft = null', i);
        expect(iNull).toBeGreaterThan(i);
    });
});
