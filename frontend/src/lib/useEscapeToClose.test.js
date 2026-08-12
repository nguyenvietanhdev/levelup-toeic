/**
 * Esc đóng modal.
 *
 * Điểm dễ sai: gắn listener ở khung modal thay vì document. Focus gần như luôn
 * nằm trong một <input> bên trong (ô dịch, ô tìm kiếm, form thêm từ) — bấm Esc
 * ở đó thì sự kiện không tới khung ngoài, và Esc "không hoạt động" một cách khó
 * hiểu: có lúc được (chưa bấm vào ô nào), có lúc không.
 *
 * Có 5 modal render riêng không đi qua ui/Modal.jsx. Hook này gom chúng lại —
 * chép tay 5 lần thì kiểu gì cũng có chỗ thứ 6 bị quên.
 */
import { describe, test, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEscapeToClose } from './useEscapeToClose.js';

function pressEsc(target = document) {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('useEscapeToClose', () => {
    test('Esc gọi onClose', () => {
        const onClose = vi.fn();
        renderHook(() => useEscapeToClose(onClose));
        pressEsc();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('Esc bấm TỪ TRONG input vẫn đóng — đây là ca hay hỏng nhất', () => {
        const onClose = vi.fn();
        renderHook(() => useEscapeToClose(onClose));

        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        pressEsc(input);

        expect(onClose).toHaveBeenCalledTimes(1);
        input.remove();
    });

    test('phím khác không đóng', () => {
        const onClose = vi.fn();
        renderHook(() => useEscapeToClose(onClose));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onClose).not.toHaveBeenCalled();
    });

    test('enabled=false thì không gắn — dành cho modal bắt buộc chọn', () => {
        const onClose = vi.fn();
        renderHook(() => useEscapeToClose(onClose, false));
        pressEsc();
        expect(onClose).not.toHaveBeenCalled();
    });

    test('gỡ listener khi unmount — không thì modal đã đóng vẫn nghe phím', () => {
        const onClose = vi.fn();
        const { unmount } = renderHook(() => useEscapeToClose(onClose));
        unmount();
        pressEsc();
        expect(onClose).not.toHaveBeenCalled();
    });

    test('onClose không phải hàm thì bỏ qua, không ném lỗi', () => {
        renderHook(() => useEscapeToClose(undefined));
        expect(() => pressEsc()).not.toThrow();
    });
});
