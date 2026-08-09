/**
 * Cử chỉ giữ-phím-để-nói. Ca quan trọng nhất không phải "giữ thì bật" mà là
 * "GÕ CHỮ HOA THÌ KHÔNG ĐƯỢC BẬT" — vì phím cử chỉ (Shift) cũng chính là phím
 * viết hoa, và `Shift+Enter` đang được dùng cho chức năng dịch nhanh.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHoldGesture } from './holdGesture.js';

describe('createHoldGesture', () => {
    let onStart, onStop, g;

    beforeEach(() => {
        vi.useFakeTimers();
        onStart = vi.fn();
        onStop = vi.fn();
        g = createHoldGesture({ thresholdMs: 350, onStart, onStop });
    });
    afterEach(() => vi.useRealTimers());

    test('giữ đủ lâu thì bật, thả ra thì tắt', () => {
        g.keyDown();
        vi.advanceTimersByTime(350);
        expect(onStart).toHaveBeenCalledTimes(1);
        expect(g.isActive()).toBe(true);

        g.keyUp();
        expect(onStop).toHaveBeenCalledTimes(1);
        expect(g.isActive()).toBe(false);
    });

    test('nhấn nhả nhanh (chưa tới ngưỡng) thì KHÔNG bật', () => {
        g.keyDown();
        vi.advanceTimersByTime(200);   // thả sớm
        g.keyUp();
        vi.advanceTimersByTime(1000);  // ngưỡng cũ không được phép nổ muộn
        expect(onStart).not.toHaveBeenCalled();
        expect(onStop).not.toHaveBeenCalled();
    });

    test('GÕ CHỮ HOA không bật micro — ca bảo vệ chính', () => {
        // Người dùng gõ "T" hoa: Shift xuống, T xuống, cả hai nhả.
        g.keyDown();
        vi.advanceTimersByTime(80);
        g.otherKeyDown();              // phím 'T'
        vi.advanceTimersByTime(1000);
        g.keyUp();
        expect(onStart).not.toHaveBeenCalled();
    });

    test('Shift+Enter (dịch nhanh) vẫn dùng được, không bật micro', () => {
        g.keyDown();
        vi.advanceTimersByTime(120);
        g.otherKeyDown();              // phím Enter
        expect(onStart).not.toHaveBeenCalled();
        expect(g.isActive()).toBe(false);
    });

    test('đang nghe mà bấm phím khác thì dừng, nhường cho tổ hợp phím đó', () => {
        g.keyDown();
        vi.advanceTimersByTime(350);
        expect(g.isActive()).toBe(true);

        g.otherKeyDown();
        expect(onStop).toHaveBeenCalledTimes(1);
        expect(g.isActive()).toBe(false);
    });

    test('auto-repeat của bàn phím không tính là nhấn mới', () => {
        g.keyDown();
        vi.advanceTimersByTime(350);
        onStart.mockClear();

        g.keyDown({ repeat: true });   // hệ điều hành lặp phím khi giữ lâu
        g.keyDown({ repeat: true });
        vi.advanceTimersByTime(1000);
        expect(onStart).not.toHaveBeenCalled();   // không bật chồng lần nữa
    });

    test('reset dọn sạch mà KHÔNG gọi onStop', () => {
        // Dùng khi rời trang hoặc mất focus: dừng bằng đường khác, không phát sự
        // kiện tắt để tránh gọi trùng.
        g.keyDown();
        vi.advanceTimersByTime(350);
        g.reset();
        expect(g.isActive()).toBe(false);
        expect(onStop).not.toHaveBeenCalled();

        g.keyUp();                      // thả muộn sau reset cũng không phát gì
        expect(onStop).not.toHaveBeenCalled();
    });

    test('thả phím khi chưa từng bật thì không phát onStop', () => {
        g.keyUp();
        expect(onStop).not.toHaveBeenCalled();
    });
});
