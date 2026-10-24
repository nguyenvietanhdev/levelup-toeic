/**
 * Tiếng Việt KHÔNG được đọc bằng giọng Anh.
 *
 * Khi `/api/tts` lỗi, các đường dự phòng rơi về giọng của trình duyệt. Trước đây
 * dự phòng chỉ phân "Trung / còn lại → en-US", và popup Dịch nhanh để trình duyệt
 * tự chọn giọng khi không tìm thấy giọng Việt — cả hai đều ra giọng Anh đọc tiếng
 * Việt. Quy tắc giờ: tiếng Việt mà không có giọng Việt thì KHÔNG đọc.
 */
import { describe, test, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { laTiengViet, giongVietTrinhDuyet } from './giongViet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf8');

const goc = globalThis.window?.speechSynthesis;
function gia(voices) {
    globalThis.window = globalThis.window || {};
    window.speechSynthesis = { getVoices: () => voices };
}
afterEach(() => { if (globalThis.window) window.speechSynthesis = goc; });

describe('nhận diện tiếng Việt', () => {
    test('vi, vi-VN, vi_VN là tiếng Việt; en, vie-x, rỗng thì không', () => {
        expect(laTiengViet('vi')).toBe(true);
        expect(laTiengViet('vi-VN')).toBe(true);
        expect(laTiengViet('vi_VN')).toBe(true);
        expect(laTiengViet('en-US')).toBe(false);
        expect(laTiengViet('vie')).toBe(false);
        expect(laTiengViet('')).toBe(false);
        expect(laTiengViet(undefined)).toBe(false);
    });
});

describe('giọng Việt của trình duyệt', () => {
    test('có giọng Việt → trả đúng giọng đó', () => {
        gia([{ name: 'Google UK', lang: 'en-GB', default: true }, { name: 'Microsoft An', lang: 'vi-VN' }]);
        expect(giongVietTrinhDuyet()?.name).toBe('Microsoft An');
    });

    test('chỉ có giọng Anh → null (để nơi gọi KHÔNG đọc)', () => {
        gia([{ name: 'Google UK', lang: 'en-GB', default: true }]);
        expect(giongVietTrinhDuyet()).toBeNull();
    });

    test('danh sách giọng chưa nạp (rỗng) hoặc không có speechSynthesis → null, không lỗi', () => {
        gia([]);
        expect(giongVietTrinhDuyet()).toBeNull();
        window.speechSynthesis = undefined;
        expect(giongVietTrinhDuyet()).toBeNull();
    });
});

describe('cả ba đường dự phòng đều chặn tiếng Việt không có giọng Việt', () => {
    const game = doc('game', 'gameLogic.js');
    const dich = doc('components', 'translate', 'TranslateModal.jsx');

    test('gameLogic — nhánh giọng trình duyệt: không có giọng Việt thì onEnd và thoát', () => {
        expect(game).toMatch(/if \(tienToNgonNgu === 'vi' && !giongViet\) \{\s*onEnd\(\);\s*return;/);
        // Chưa chọn giọng nào thì gán thẳng giọng Việt, không để trình duyệt tự chọn.
        expect(game).toMatch(/if \(giongViet && !utterance\.voice\) utterance\.voice = giongViet;/);
    });

    test('gameLogic — dự phòng khi /api/tts lỗi: tiếng Việt KHÔNG còn rơi về en-US', () => {
        const i = game.indexOf("console.warn('Google TTS API failed");
        const than = game.slice(i, game.indexOf('window.speechSynthesis.speak(utterance);', i));
        expect(than).toMatch(/if \(lang\.startsWith\('vi'\)\)/);
        expect(than).toMatch(/if \(!giongViet\) \{ if \(onEnd\) onEnd\(\); return; \}/);
        expect(than).toMatch(/utterance\.voice = giongViet;/);
    });

    test('popup Dịch nhanh: tiếng Việt không có giọng Việt thì không đọc', () => {
        const i = dich.indexOf('function fallbackSpeak(');
        const than = dich.slice(i, dich.indexOf('\n}', i));
        expect(than).toMatch(/if \(laTiengViet\(code\) && !giongVietTrinhDuyet\(\)\) return;/);
    });
});
