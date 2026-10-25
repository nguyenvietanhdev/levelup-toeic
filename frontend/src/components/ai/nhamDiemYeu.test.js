/**
 * Công tắc "Nhắm lỗi hay mắc" ở Hội thoại / Viết / Dịch.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Gửi `nhamYeu` nhưng không đưa vào deps của useCallback → tắt rồi vẫn nhắm.
 *   2. Hiện công tắc với người học tiếng Trung (server không nhắm tiếng Trung).
 *   3. localStorage bị chặn (chế độ riêng tư) làm hỏng cả màn.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const comp = doc('components', 'ai', 'NhamDiemYeu.jsx');
const MAN = {
    'Hội thoại': doc('components', 'conversation', 'ConversationScreen.jsx'),
    'Viết': doc('components', 'essay', 'EssayScreen.jsx'),
    'Dịch': doc('components', 'translation', 'TranslationScreen.jsx'),
};

describe('component', () => {
    test('mặc định BẬT; đọc/ghi localStorage đều bọc try/catch', () => {
        expect(comp).toMatch(/try \{ return localStorage\.getItem\(KHOA\) !== '0'; \} catch \{ return true; \}/);
        expect(comp).toMatch(/try \{ localStorage\.setItem\(KHOA, b \? '0' : '1'\); \} catch/);
    });

    test('nhãn trong bài không hiện khi không nhắm gì', () => {
        expect(comp).toMatch(/if \(!Array\.isArray\(ds\) \|\| ds\.length === 0\) return null;/);
    });
});

describe.each(Object.entries(MAN))('%s', (ten, src) => {
    test('công tắc chỉ hiện với tiếng Anh, đặt ngay trên nút bắt đầu', () => {
        expect(src).toMatch(/\{lang !== 'zh' && <NutNhamYeu bat=\{nhamYeu\} onDoi=\{doiNhamYeu\} \/>\}\s*\n\s*\{\/\* Nút bắt đầu nổi/);
    });

    test('nhãn "Bài này có cài chỗ luyện" lấy từ phản hồi server', () => {
        expect(src).toMatch(/<NhanNham ds=\{(convo|prompt|de)\.nhamLoi\} \/>/);
    });
});

test('Viết / Dịch: nhamYeu nằm trong deps (tắt là lần sau không nhắm)', () => {
    expect(MAN['Viết']).toMatch(/\}, \[loadingPrompt,[^\]]*nhamYeu\]\);/);
    expect(MAN['Dịch']).toMatch(/\}, \[loadingDe,[^\]]*nhamYeu\]\);/);
});

test('Hội thoại: không nhắm với tiếng Trung, nhamYeu trong deps của handleStart', () => {
    const src = MAN['Hội thoại'];
    expect(src).toMatch(/nhamYeu: lang !== 'zh' && nhamYeu,/);
    expect(src).toMatch(/\}, \[starting[^\]]*nhamYeu[^\]]*\]\);/);
});
