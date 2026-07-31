import { describe, it, expect } from 'vitest';
import { Utils } from './utils.js';

describe('Utils.formatNumber', () => {
    it('thêm dấu phẩy phân cách hàng nghìn', () => {
        expect(Utils.formatNumber(1000)).toBe('1,000');
        expect(Utils.formatNumber(1234567)).toBe('1,234,567');
    });

    it('không đổi số dưới 1000', () => {
        expect(Utils.formatNumber(999)).toBe('999');
    });
});

describe('Utils.clamp', () => {
    it('kẹp giá trị trong khoảng min-max', () => {
        expect(Utils.clamp(5, 0, 10)).toBe(5);
        expect(Utils.clamp(-5, 0, 10)).toBe(0);
        expect(Utils.clamp(15, 0, 10)).toBe(10);
    });
});

describe('Utils.percentage', () => {
    it('tính phần trăm làm tròn', () => {
        expect(Utils.percentage(1, 3)).toBe(33);
        expect(Utils.percentage(50, 100)).toBe(50);
    });

    it('trả về 0 khi total = 0 (tránh chia cho 0)', () => {
        expect(Utils.percentage(5, 0)).toBe(0);
    });
});

describe('Utils.formatTime', () => {
    it('format mm:ss khi dưới 1 giờ', () => {
        expect(Utils.formatTime(65)).toBe('01:05');
        expect(Utils.formatTime(59)).toBe('00:59');
    });

    it('format hh:mm:ss khi từ 1 giờ trở lên', () => {
        expect(Utils.formatTime(3661)).toBe('01:01:01');
    });
});

describe('Utils.parseTime', () => {
    it('parse mm:ss thành giây', () => {
        expect(Utils.parseTime('01:05')).toBe(65);
    });

    it('parse hh:mm:ss thành giây', () => {
        expect(Utils.parseTime('01:01:01')).toBe(3661);
    });
});

describe('Utils.isValidEmail', () => {
    it('chấp nhận email hợp lệ', () => {
        expect(Utils.isValidEmail('a@b.com')).toBe(true);
    });

    it('từ chối email không hợp lệ', () => {
        expect(Utils.isValidEmail('not-an-email')).toBe(false);
        expect(Utils.isValidEmail('a@b')).toBe(false);
    });
});

describe('Utils.getXpForLevel / getLevelFromXp (công thức lên cấp)', () => {
    it('getXpForLevel tăng dần theo level', () => {
        const xp1 = Utils.getXpForLevel(1);
        const xp10 = Utils.getXpForLevel(10);
        expect(xp10).toBeGreaterThan(xp1);
    });

    it('getLevelFromXp trả về level 1 khi chưa có XP', () => {
        const result = Utils.getLevelFromXp(0);
        expect(result.level).toBe(1);
        expect(result.isMaxLevel).toBe(false);
    });

    it('getLevelFromXp roundtrip nhất quán với getXpForLevel', () => {
        // Cộng đủ XP cho level 1 phải lên đúng level 2.
        const xpForLevel1 = Utils.getXpForLevel(1);
        const result = Utils.getLevelFromXp(xpForLevel1);
        expect(result.level).toBe(2);
        expect(result.currentXp).toBe(0);
    });
});

describe('Utils.deepMerge', () => {
    it('merge lồng nhau, source ghi đè target', () => {
        const target = { a: 1, nested: { x: 1, y: 2 } };
        const source = { b: 2, nested: { y: 99 } };
        const result = Utils.deepMerge(target, source);
        expect(result).toEqual({ a: 1, b: 2, nested: { x: 1, y: 99 } });
    });
});

describe('Utils.capitalize / truncate', () => {
    it('viết hoa chữ cái đầu', () => {
        expect(Utils.capitalize('hello')).toBe('Hello');
    });

    it('cắt chuỗi dài và thêm dấu ...', () => {
        expect(Utils.truncate('hello world', 8)).toBe('hello...');
    });

    it('giữ nguyên chuỗi ngắn hơn maxLength', () => {
        expect(Utils.truncate('hi', 8)).toBe('hi');
    });
});
