/**
 * Xác định ngôn ngữ của từ trong bộ "Từ vựng riêng".
 *
 * Bộ này TRỘN Anh–Trung: gõ `你会吗` vào ô Dịch nhanh rồi lưu thì chữ Hán nằm
 * trong trường `en`, ngay cạnh những từ tiếng Anh thật. Đọc bằng giọng sai là ra
 * một tràng vô nghĩa — mà không có lỗi nào, chỉ có âm thanh kỳ quặc, nên người
 * dùng tưởng tính năng phát âm hỏng chứ không nghĩ là sai ngôn ngữ.
 *
 * Từ lưu MỚI mang sẵn `lang` (backend ghi lúc bấm Thêm). Từ CŨ trong DB thì
 * không có — nên phải đoán bằng mặt chữ, và test này chốt cả hai đường.
 */
import { describe, test, expect } from 'vitest';
import { hasHanzi, wordLang, ttsLangOf } from './wordLang.js';

describe('hasHanzi', () => {
    test('nhận ra chữ Hán', () => {
        expect(hasHanzi('你好')).toBe(true);
        expect(hasHanzi('这是谁')).toBe(true);
    });

    test('lẫn Hán trong câu vẫn tính là có', () => {
        expect(hasHanzi('HSK1 学')).toBe(true);
    });

    test('tiếng Anh thuần thì không', () => {
        expect(hasHanzi('caterer')).toBe(false);
        expect(hasHanzi('pronunciation')).toBe(false);
    });

    test('tiếng Việt có dấu KHÔNG bị nhầm thành Hán', () => {
        // Dấu tiếng Việt nằm ngoài dải Hán — nhầm ở đây là đọc tiếng Việt bằng
        // giọng Trung.
        expect(hasHanzi('đủ tốt chứ')).toBe(false);
        expect(hasHanzi('bạn sẽ làm được')).toBe(false);
    });

    test('rỗng/null không ném lỗi', () => {
        expect(hasHanzi('')).toBe(false);
        expect(hasHanzi(null)).toBe(false);
        expect(hasHanzi(undefined)).toBe(false);
    });
});

describe('wordLang — ưu tiên lang đã lưu', () => {
    test('dùng lang đã lưu khi có', () => {
        expect(wordLang({ en: 'caterer', lang: 'en' })).toBe('en');
        expect(wordLang({ en: '你好', lang: 'zh' })).toBe('zh');
    });

    test('lang đã lưu THẮNG cả khi mặt chữ nói khác', () => {
        // Người dùng có thể sửa từ sau khi lưu; giá trị đã ghi vẫn đáng tin hơn
        // suy đoán.
        expect(wordLang({ en: 'hello', lang: 'zh' })).toBe('zh');
    });

    test('lang lạ thì bỏ qua, quay về đoán mặt chữ', () => {
        expect(wordLang({ en: '你好', lang: 'fr' })).toBe('zh');
        expect(wordLang({ en: 'hello', lang: 'fr' })).toBe('en');
    });
});

describe('wordLang — đoán cho từ CŨ chưa có lang', () => {
    test('có chữ Hán → zh', () => {
        expect(wordLang({ en: '这是哪里' })).toBe('zh');
    });

    test('không có chữ Hán → en', () => {
        expect(wordLang({ en: 'caterer' })).toBe('en');
    });

    test('bản ghi hỏng không ném lỗi', () => {
        expect(wordLang({})).toBe('en');
        expect(wordLang(null)).toBe('en');
    });
});

describe('ttsLangOf — mã giọng đọc', () => {
    test('trả mã đầy đủ, không phải mã ngắn', () => {
        // Web Speech cần 'zh-CN'/'en-US'; đưa 'zh' vào là không tìm thấy giọng.
        expect(ttsLangOf({ en: '你好' })).toBe('zh-CN');
        expect(ttsLangOf({ en: 'hello' })).toBe('en-US');
    });

    test('theo lang đã lưu', () => {
        expect(ttsLangOf({ en: 'x', lang: 'zh' })).toBe('zh-CN');
    });
});
