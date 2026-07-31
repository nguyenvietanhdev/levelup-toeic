import { describe, test, expect } from 'vitest';
import { formatTime } from './useToeicTimer.js';

describe('formatTime — luôn đọc theo phút', () => {
    test('chặng Nghe 45\' và Đọc 75\' đọc cùng một kiểu', () => {
        expect(formatTime(45 * 60)).toBe('45:00');
        expect(formatTime(75 * 60)).toBe('75:00');
    });

    test('quá 1 tiếng KHÔNG tách sang dạng giờ', () => {
        expect(formatTime(75 * 60 - 7)).toBe('74:53');   // ảnh cũ hiện 1:14:53
        expect(formatTime(120 * 60)).toBe('120:00');
        expect(formatTime(3600)).toBe('60:00');
    });

    test('dưới 1 tiếng giữ nguyên như trước', () => {
        expect(formatTime(0)).toBe('00:00');
        expect(formatTime(9)).toBe('00:09');
        expect(formatTime(59)).toBe('00:59');
        expect(formatTime(600)).toBe('10:00');
    });
});
