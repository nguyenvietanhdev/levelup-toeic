/**
 * Lỗi → công thức ngữ pháp, theo ngôn ngữ của bài.
 *
 * Chỗ dễ hỏng: học tiếng Trung mà bấm "xem công thức" ở lỗi trật tự từ lại mở mục tiếng Anh,
 * hoặc mở đúng mục nhưng ngăn ngữ pháp vẫn ở thư viện tiếng Anh.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const lang = vi.hoisted(() => ({ v: 'en' }));
vi.mock('@api/vocabulary.js', () => ({ getVocabLang: () => lang.v }));

import { nguPhapChoLoi } from './nguPhapLienKet.js';

beforeEach(() => { lang.v = 'en'; });

describe('nguPhapChoLoi', () => {
    test('học tiếng Anh: mở mục tiếng Anh, kèm ngôn ngữ', () => {
        expect(nguPhapChoLoi('article')).toEqual({ id: 'mao-tu', lang: 'en' });
        expect(nguPhapChoLoi('tense')).toEqual({ nhom: 'thi', lang: 'en' });
    });
    test('học tiếng Trung: cùng nhóm lỗi dùng chung nhưng mở mục tiếng Trung', () => {
        lang.v = 'zh';
        expect(nguPhapChoLoi('word-order')).toEqual({ id: 'zh-trat-tu', lang: 'zh' });
        expect(nguPhapChoLoi('measure-word')).toEqual({ id: 'zh-luong-tu', lang: 'zh' });
        expect(nguPhapChoLoi('article')).toBeNull();
    });
    test('kho song ngữ (bi) học bằng tiếng Anh, như backend', () => {
        lang.v = 'bi';
        expect(nguPhapChoLoi('word-order')).toEqual({ id: 'cau-hoi-wh', lang: 'en' });
    });
    test('lỗi không gắn được công thức thì không có lối vào', () => {
        expect(nguPhapChoLoi('spelling')).toBeNull();
        expect(nguPhapChoLoi('character', 'zh')).toBeNull();
    });
});
