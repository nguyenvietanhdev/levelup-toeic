/**
 * Chọn mức khó ở BỐN màn AI.
 *
 * Hai chế độ mới (Dịch, Đọc hiểu) có sẵn từ đầu; hai chế độ cũ (Hội thoại, Viết
 * luận) thì không — Hội thoại còn cứng ở "beginner" phía server. Test này khoá
 * lại để bốn màn không lệch nhau nữa.
 *
 * Ba chữ "Dễ/Vừa/Khó" ở bốn màn phải nghĩa GIỐNG NHAU, nếu không người học
 * không so được giữa các chế độ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');

const MAN = {
    'Hội thoại': doc('components', 'conversation', 'ConversationScreen.jsx'),
    'Viết luận': doc('components', 'essay', 'EssayScreen.jsx'),
    'Dịch đoạn văn': doc('components', 'translation', 'TranslationScreen.jsx'),
    'Đọc hiểu': doc('components', 'reading', 'ReadingScreen.jsx'),
};

describe('bốn màn AI đều cho chọn mức khó', () => {
    for (const [ten, src] of Object.entries(MAN)) {
        // Màn dùng bảng chung `doKhoChoKieu` (lib/kieuCham.js) không khai báo MUC_KHO riêng;
        // ba khoá easy/medium/hard của bảng chung đã được khoá ở kieuChamDoKho.test.js.
        const dungBangChung = !src.includes('const MUC_KHO = [') && /doKhoList=\{doKhoChoKieu\(/.test(src);

        test(`${ten} có hàng chọn mức`, () => {
            expect(src).toMatch(dungBangChung ? /doKhoChoKieu/ : /const MUC_KHO = \[/);
            // Hàng chọn mức nằm trong class `tr-levels` hoặc component dùng chung KieuChamDoKho.
            expect(src).toMatch(/tr-levels|KieuChamDoKho/);
            expect(src).toMatch(/useState\('medium'\)/);
        });

        test.skipIf(dungBangChung)(`${ten} dùng đúng ba khoá easy/medium/hard`, () => {
            // Lệch khoá thì server `chuanHoaMuc` đẩy hết về `medium` và nút
            // "Khó" không làm gì cả — im lặng.
            const i = src.indexOf('const MUC_KHO = [');
            const khoi = src.slice(i, src.indexOf('];', i));
            for (const k of ['easy', 'medium', 'hard']) {
                expect(khoi).toContain(`key: '${k}'`);
            }
        });

        test.skipIf(dungBangChung)(`${ten} mô tả nói rõ mức ảnh hưởng gì`, () => {
            // "Dễ/Vừa/Khó" một mình không cho biết là khó ở từ vựng, ở độ dài,
            // hay ở đề bài.
            const i = src.indexOf('const MUC_KHO = [');
            const khoi = src.slice(i, src.indexOf('];', i));
            expect((khoi.match(/desc: '/g) || []).length).toBe(3);
        });
    }
});

describe('mức được GỬI lên server', () => {
    test('Hội thoại gửi khi mở phiên', () => {
        expect(MAN['Hội thoại']).toMatch(/ConversationAPI\.start\(\{\s*context,\s*level,\s*rubric: rubricGui,\s*strictGrammar:/);
    });

    test('Viết luận gửi khi xin đề', () => {
        expect(MAN['Viết luận']).toMatch(/EssayAPI\.prompt\(\{ level, rubric: kieuDangChon, \.\.\.dangGui\(\{ dang, tuChon, goiY \}\), nhamYeu \}\)/);
    });

    test('mức nằm trong deps — đổi mức là lần sau dùng mức mới', () => {
        // Thiếu deps thì `useCallback` giữ giá trị cũ: bấm "Khó" rồi bấm "Bắt
        // đầu" vẫn ra bài "Vừa", và không có gì báo.
        expect(MAN['Hội thoại']).toMatch(/\}, \[starting[^\]]*level[^\]]*\]\);/);
        expect(MAN['Viết luận']).toContain('}, [loadingPrompt, level, kieuDangChon, dang, tuChon, goiY, nhamYeu]);');
    });
});
