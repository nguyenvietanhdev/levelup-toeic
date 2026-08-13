/**
 * Popup Dịch nhanh phải tự focus vào ô GỐC, và giữ Shift ở đó vẫn nói được.
 *
 * Hai thứ này phụ thuộc nhau, bỏ một cái là cái kia vô nghĩa:
 *
 * 1. TỰ FOCUS. Nói ở thanh nav xong, popup mở lên — con trỏ phải sẵn trong ô
 *    gốc. Không thì muốn nói tiếp phải bấm chuột vào form trước, thêm một thao
 *    tác thừa giữa hai lần nói.
 *
 * 2. Ô GỐC LÀ NGOẠI LỆ của `typing()`. Hàm đó chặn phím tắt khi con trỏ đang ở
 *    một ô nhập — hợp lý cho ô bản dịch, nhưng áp lên ô gốc thì việc tự focus
 *    TỰ PHÁ CHÍNH MÌNH: con trỏ vào ô, typing() thành true, giữ Shift chết.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'TranslateModal.jsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

/** Bản sao `typing()` trong TranslateModal, để kiểm hành vi chứ không chỉ chuỗi. */
function typingWith(el) {
    if (!el) return false;
    if (el.id === 'translate-src-input') return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || !!el.isContentEditable;
}

describe('tự focus vào ô gốc', () => {
    test('ô gốc có autoFocus', () => {
        expect(src).toMatch(/id="translate-src-input"[\s\S]{0,400}autoFocus/);
    });

    test('đặt con trỏ về CUỐI chữ, không bôi đen cả ô', () => {
        // autoFocus trên input có sẵn nội dung sẽ chọn hết chữ ở một số trình
        // duyệt — gõ thêm một ký tự là mất sạch từ vừa đọc được.
        expect(src).toMatch(/setSelectionRange\(n, n\)/);
    });
});

describe('typing() — ô gốc là ngoại lệ', () => {
    test('con trỏ Ở Ô GỐC thì KHÔNG chặn phím tắt', () => {
        // Đây là ca quyết định: chặn ở đây thì tự focus tự phá chính mình.
        expect(typingWith({ id: 'translate-src-input', tagName: 'INPUT' })).toBe(false);
    });

    test('con trỏ ở ô nhập KHÁC thì vẫn chặn', () => {
        expect(typingWith({ id: 'translate-vn-input', tagName: 'INPUT' })).toBe(true);
        expect(typingWith({ id: '', tagName: 'TEXTAREA' })).toBe(true);
    });

    test('vùng soạn thảo giàu định dạng cũng chặn', () => {
        expect(typingWith({ id: '', tagName: 'DIV', isContentEditable: true })).toBe(true);
    });

    test('không focus vào đâu thì cho phím tắt chạy', () => {
        expect(typingWith({ id: '', tagName: 'BODY' })).toBe(false);
        expect(typingWith(null)).toBe(false);
    });

    test('trả BOOLEAN, không phải undefined', () => {
        // `isContentEditable` không có trên mọi phần tử; thiếu `!!` là hàm trả
        // undefined — vẫn falsy nhưng khó đọc và dễ dùng nhầm về sau.
        expect(typeof typingWith({ id: '', tagName: 'BODY' })).toBe('boolean');
    });
});

describe('nguồn thật có nối đúng', () => {
    test('typing() loại trừ ô gốc theo id', () => {
        expect(src).toMatch(/el\.id === 'translate-src-input'/);
    });

    test('giữ Shift trong popup vẫn xoá chữ cũ trước khi nghe', () => {
        // Nói đè lên chữ đang có, không nối đuôi thành câu vô nghĩa.
        expect(src).toMatch(/setSrcDraft\(''\);\s*s\.start\(\)/);
    });

    test('tự kiểm: đọc được nội dung thật', () => {
        expect(src.length).toBeGreaterThan(5000);
        expect(src).toMatch(/createHoldGesture/);
    });
});
