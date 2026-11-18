/**
 * Thông báo lỗi trình phát YouTube: nói rõ nguyên nhân và cách xử lý thay vì một câu chung chung.
 * Thử thật: video chính thức của hãng đĩa hay chặn phát nhúng (mã 150) dù oEmbed vẫn trả 200.
 */
import { describe, test, expect } from 'vitest';
import { loiYoutube } from './useYoutube.js';

describe('lỗi trình phát YouTube', () => {
    test('chặn nhúng (101/150): gợi ý tìm bản khác', () => {
        expect(loiYoutube(150)).toMatch(/không cho phát nhúng/);
        expect(loiYoutube(101)).toMatch(/lyric video/);
    });
    test('các mã khác', () => {
        expect(loiYoutube(100)).toMatch(/không còn tồn tại/);
        expect(loiYoutube(2)).toMatch(/không hợp lệ/);
        expect(loiYoutube(153)).toMatch(/referrer/);
        expect(loiYoutube(5)).toMatch(/mã 5/);
    });
});
