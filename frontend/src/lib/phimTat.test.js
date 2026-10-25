/**
 * Sổ tay phím tắt phải NÓI ĐÚNG những gì mã nguồn làm.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Đổi phím ở một chế độ mà quên sửa sổ tay → sổ tay dạy sai.
 *   2. Phím `?` cướp mất dấu hỏi khi người dùng đang gõ (ô tìm kiếm, ô viết bài).
 *   3. Esc của sổ tay đóng luôn popup bên dưới.
 *   4. Sổ tay đổi màn → đang luyện mở ra xem bị hỏi "Thoát luyện tập?".
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NHOM_PHIM_TAT, xepTheoMan } from './phimTat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const nhom = (k) => NHOM_PHIM_TAT.find((n) => n.key === k);
const coPhim = (k, phim) => nhom(k).phim.some((p) => p.phim.includes(phim) || p.hoac?.includes(phim));

describe('sổ tay khớp với mã nguồn', () => {
    test('Flashcard: Cách/Enter lật, ←/1 chưa biết, →/2 đã biết, P phát âm', () => {
        const src = doc('components', 'practice', 'modes', 'flashcard.js');
        expect(src).toMatch(/e\.key === ' ' \|\| e\.key === 'Enter'\) \{\s*e\.preventDefault\(\);\s*this\.flipCard\(\);/);
        expect(src).toMatch(/e\.key === 'ArrowLeft' \|\| e\.key === '1'\) \{\s*this\.markAsUnknown/);
        expect(src).toMatch(/e\.key === 'ArrowRight' \|\| e\.key === '2'\) \{\s*this\.markAsKnown/);
        expect(src).toMatch(/e\.key === 'p' \|\| e\.key === 'P'/);
        for (const k of ['Cách', 'Enter', '←', '1', '→', '2', 'P']) expect(coPhim('flashcard', k)).toBe(true);
    });

    test('Tốc độ: ←/1 = Đúng, →/2 = Sai', () => {
        const src = doc('components', 'practice', 'modes', 'speedQuiz.js');
        expect(src).toMatch(/e\.key === 'ArrowLeft' \|\| e\.key === '1'\) \{\s*userAnswer = true;/);
        expect(src).toMatch(/e\.key === 'ArrowRight' \|\| e\.key === '2'\) \{\s*userAnswer = false;/);
        expect(nhom('toc-do').phim[0].viec).toMatch(/ĐÚNG/);
    });

    test('Luyện tập: chạm Ctrl phát lại âm thanh', () => {
        expect(doc('components', 'practice', 'practiceManager.js')).toMatch(/GameLogic\.replayLast\(\)/);
        expect(coPhim('luyen-tap', 'Ctrl')).toBe(true);
    });

    test('Hội thoại giọng nói: giữ Cách ghi âm, Enter gửi, Delete/Backspace ghi lại', () => {
        const src = doc('components', 'conversation', 'ConversationScreen.jsx');
        expect(src).toMatch(/const onKeyUp = \(e\) => \{\s*if \(!laCach\(e\)/);
        expect(src).toMatch(/e\.key === 'Delete' \|\| e\.key === 'Backspace'/);
        for (const k of ['Giữ Cách', 'Enter', 'Delete', 'Backspace']) expect(coPhim('hoi-thoai', k)).toBe(true);
    });

    test('Mọi nơi: Shift+Z và giữ Ctrl + bôi đen để dịch, đều tắt khi thi', () => {
        const src = doc('layouts', 'TopNav.jsx');
        expect(src).toMatch(/e\.shiftKey && \(e\.key === 'Z' \|\| e\.key === 'z'\)/);
        expect(src).toMatch(/!\(e\.ctrlKey \|\| e\.metaKey\) \|\| isInExam/);
        expect(coPhim('chung', 'Z')).toBe(true);
        expect(coPhim('chung', 'Giữ Ctrl')).toBe(true);
    });

    test('Ô tìm kiếm: Enter mở Dịch nhanh, Esc xoá', () => {
        const src = doc('layouts', 'TopNav.jsx');
        expect(src).toMatch(/if \(e\.key === 'Escape'\) \{\s*e\.preventDefault\(\);[\s\S]{0,300}closeSearch\(\);/);
        expect(src).toMatch(/if \(q\) setTranslateText\(q\);/);
    });
});

describe('sổ tay', () => {
    const comp = doc('components', 'phimTat', 'SoTayPhimTat.jsx');

    test('`?` mở/đóng, nhưng KHÔNG khi đang gõ chữ', () => {
        expect(comp).toMatch(/if \(e\.key !== '\?' \|\| e\.ctrlKey/);
        expect(comp).toMatch(/if \(laDangGo\(e\.target\)\) return;/);
    });

    test('đang mở thì giữ bàn phím: chặn MỌI phím ở pha capture; Esc / ? đóng', () => {
        // Không chặn thì Cách lật thẻ Flashcard bên dưới, Esc đóng popup bên dưới.
        expect(comp).toMatch(/const giuPhim = \(e\) => \{\s*e\.stopPropagation\(\);/);
        expect(comp).toMatch(/if \(e\.key === 'Escape' \|\| e\.key === '\?'\)/);
        expect(comp).toMatch(/window\.addEventListener\('keydown', giuPhim, true\)/);
        expect(comp).toMatch(/window\.addEventListener\('keyup', giuPhim, true\)/);
    });

    test('lớp phủ riêng, không đổi màn và không dùng khe modal chung', () => {
        expect(comp).toMatch(/createPortal\(/);
        expect(comp).not.toMatch(/showScreen|Modal\.show/);
        expect(doc('App.jsx')).toMatch(/<SoTayPhimTat \/>/);
    });

    test('menu có mục "Phím tắt" (khách cũng xem được), mở bằng sự kiện', () => {
        const menu = doc('layouts', 'SideMenu.jsx');
        expect(menu).toMatch(/\{ label: 'Phím tắt', icon: 'fa-keyboard', action: 'phim-tat', guestOk: true \}/);
        expect(menu).toMatch(/if \(item\.action === 'phim-tat'\) \{ setMenuOpen\(false\); return moSoTayPhimTat\(\); \}/);
    });

    test('nhóm của màn đang mở được đưa lên đầu', () => {
        expect(xepTheoMan(NHOM_PHIM_TAT, 'voice-conversation-screen')[0].key).toBe('hoi-thoai');
        expect(xepTheoMan(NHOM_PHIM_TAT, 'home-screen')[0].key).toBe('chung');
    });
});
