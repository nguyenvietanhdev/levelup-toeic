/**
 * Bộ lọc độ khó (Dễ · Trung bình · Khó) phải theo ĐÚNG khung của ngôn ngữ.
 *
 * Hệ thống dùng song song hai khung:
 *   - Tiếng Anh: CEFR   A1 A2 · B1 B2 · C1 C2
 *   - Tiếng Trung: HSK  HSK1 HSK2 · HSK3 HSK4 · HSK5 HSK6 HSK7-9
 *
 * Bộ lọc so khớp CHÍNH XÁC từng chuỗi (`levelFilter.includes(w.level)`), nên
 * dùng bảng CEFR cho kho tiếng Trung là khớp 0 từ: chọn "Dễ" xong vào luyện tập
 * báo hết từ, mà ô độ khó vẫn hiện "Dễ" bình thường — không gì chỉ ra vì sao.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { levelsFor, bandLabel, BANDS } from './levelBands.js';

describe('levelsFor — danh sách level theo ngôn ngữ', () => {
    test('tiếng Anh dùng CEFR', () => {
        expect(levelsFor('easy', 'en')).toEqual(['A1', 'A2']);
        expect(levelsFor('medium', 'en')).toEqual(['B1', 'B2']);
        expect(levelsFor('hard', 'en')).toEqual(['C1', 'C2']);
    });

    test('tiếng Trung dùng HSK', () => {
        expect(levelsFor('easy', 'zh')).toEqual(['HSK1', 'HSK2']);
        expect(levelsFor('medium', 'zh')).toEqual(['HSK3', 'HSK4']);
    });

    test('mức Khó của tiếng Trung gồm CẢ HSK7-9', () => {
        // Kho zh có 5.363 từ HSK7-9 — bỏ sót là mất hơn nửa số từ ở mức Khó.
        expect(levelsFor('hard', 'zh')).toContain('HSK7-9');
        expect(levelsFor('hard', 'zh')).toEqual(['HSK5', 'HSK6', 'HSK7-9']);
    });

    test('"Toàn bộ" → null (không lọc), ở cả hai ngôn ngữ', () => {
        // `null` chứ không phải mảng rỗng: mảng rỗng lọt vào `includes` là lọc
        // ra 0 từ, còn `null` mới có nghĩa "bỏ qua bộ lọc".
        expect(levelsFor('adaptive', 'en')).toBeNull();
        expect(levelsFor('adaptive', 'zh')).toBeNull();
    });

    test('khớp đúng các mức HSK có thật trong kho', () => {
        // Kho zh sau migration chỉ có 7 giá trị này. Sai một chữ là lọc trượt.
        const all = [...levelsFor('easy', 'zh'), ...levelsFor('medium', 'zh'), ...levelsFor('hard', 'zh')];
        expect(all).toEqual(['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9']);
    });
});

describe('bandLabel — nhãn hiện trên ô chọn', () => {
    test('tiếng Trung ghi HSK, KHÔNG ghi A1-A2', () => {
        // Đây là lỗi người dùng thấy: ô ghi "Dễ (A1-A2)" khi đang học tiếng Trung.
        expect(bandLabel('easy', 'zh')).toBe('Dễ (HSK1-2)');
        expect(bandLabel('easy', 'zh')).not.toMatch(/A1/);
        expect(bandLabel('hard', 'zh')).toMatch(/HSK/);
    });

    test('tiếng Anh giữ nguyên CEFR', () => {
        expect(bandLabel('easy', 'en')).toBe('Dễ (A1-A2)');
        expect(bandLabel('hard', 'en')).toBe('Khó (C1-C2)');
    });

    test('"Toàn bộ" không kèm khung nào', () => {
        expect(bandLabel('adaptive', 'en')).toBe('Toàn bộ');
        expect(bandLabel('adaptive', 'zh')).toBe('Toàn bộ');
    });

    test('BANDS đủ bốn lựa chọn, đúng thứ tự dễ → khó', () => {
        expect(BANDS).toEqual(['easy', 'medium', 'hard', 'adaptive']);
    });
});

describe('không còn bảng CEFR chép cứng ở nơi khác', () => {
    const read = (p) => readFileSync(join(__dirname, '..', p), 'utf8');

    test('QuickSettings dùng module chung', () => {
        const src = read('layouts/QuickSettings.jsx');
        expect(src).toMatch(/from '@lib\/levelBands\.js'/);
        // Bảng chép cứng cũ phải đi hẳn, không để lại bản song song.
        expect(src).not.toMatch(/easy:\s*\['A1', 'A2'\]/);
    });

    test('SettingsScreen dùng module chung', () => {
        const src = read('components/settings/SettingsScreen.jsx');
        expect(src).toMatch(/levelsFor\(value, s\.vocabLang/);
        expect(src).not.toMatch(/const levelMap = \{ easy: \['A1'/);
    });

    test('PracticePanel dựng option từ BANDS', () => {
        const src = read('components/settings/panels/PracticePanel.jsx');
        expect(src).toMatch(/BANDS\.map/);
        expect(src).not.toMatch(/<option value="easy">Dễ \(A1-A2\)<\/option>/);
    });

    test('practiceManager không còn bảng nhãn riêng', () => {
        const src = read('components/practice/practiceManager.js');
        expect(src).toMatch(/bandLabel\(difficulty, lang\)/);
        expect(src).not.toMatch(/'easy': 'Dễ \(A1-A2\)'/);
    });
});

describe('đổi ngôn ngữ thì dịch luôn bộ lọc đang bật', () => {
    test('QuickSettings cập nhật levelFilter khi chuyển ngôn ngữ', () => {
        // Không dịch thì `['A1','A2']` còn nguyên lúc sang tiếng Trung → 0 từ.
        const src = readFileSync(join(__dirname, '..', 'layouts', 'QuickSettings.jsx'), 'utf8');
        expect(src).toMatch(/s\.levelFilter = levelsFor\(s\.difficulty, next\)/);
    });

    test('chế độ "Toàn bộ" không bị đụng tới', () => {
        // `adaptive` vốn là null — ghi đè cũng ra null, nhưng chặn sớm cho rõ ý.
        const src = readFileSync(join(__dirname, '..', 'layouts', 'QuickSettings.jsx'), 'utf8');
        expect(src).toMatch(/s\.difficulty !== 'adaptive'/);
    });
});
