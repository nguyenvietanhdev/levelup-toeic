/**
 * Giao diện chữa bài (Viết, Dịch, Lịch sử) và Sổ tay lỗi.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Màn kết quả vẫn dùng danh sách lỗi rời → chữa bài không xuất hiện.
 *   2. Bấm "Kiểm tra" khi chưa gõ → so chuỗi rỗng thay vì thứ đang hiện trong ô.
 *   3. ← → cướp phím khi đang gõ trong ô tự sửa.
 *   4. Sổ tay phím tắt không nhắc phím của chữa bài.
 *   5. Sổ tay lỗi tải ngay cả khi chưa mở tab.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NHOM_PHIM_TAT } from '@lib/phimTat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const cb = doc('components', 'chuaBai', 'ChuaBai.jsx');

describe('gắn vào các màn', () => {
    test('Viết: chữa trên chính bài vừa nộp', () => {
        const s = doc('components', 'essay', 'EssayScreen.jsx');
        expect(s).toMatch(/<ChuaBai text=\{essay\} loi=\{result\.issues\} \/>/);
        expect(s).not.toMatch(/result\.issues\.map/);
    });

    test('Dịch: chữa trên bản dịch', () => {
        const s = doc('components', 'translation', 'TranslationScreen.jsx');
        expect(s).toMatch(/<ChuaBai text=\{banDich\} loi=\{result\.notes\}/);
        expect(s).not.toMatch(/result\.notes\.map/);
    });

    test('Lịch sử: bài cũ cũng chữa trên bài', () => {
        const s = doc('components', 'history', 'LichSuMode.jsx');
        expect(s).toMatch(/<ChuaBai text=\{bai\.essay\} loi=\{bai\.issues\} \/>/);
        expect(s).toMatch(/<ChuaBai text=\{bai\.translation\} loi=\{bai\.notes\}/);
    });
});

describe('component chữa bài', () => {
    test('ba cách xem: bài của bạn / đã sửa / so sánh', () => {
        expect(cb).toMatch(/\[\['ban', 'Bài của bạn'\], \['sua', 'Đã sửa'\], \['so-sanh', 'So sánh'\]\]/);
    });

    test('kiểm tra so ĐÚNG thứ đang hiện trong ô (chưa gõ = trích dẫn gốc)', () => {
        expect(cb).toMatch(/const nhap = tuSua\[l\.id\]\?\.nhap \?\? l\.quote;/);
        expect(cb).toMatch(/value=\{ts\.nhap \?\? dangChon\.quote\}/);
    });

    test('cụm sửa không thay thế được (bài cũ, tiếng Việt) → chỉ hiện như ghi chú, không cho tự sửa', () => {
        expect(cb).toMatch(/\{dangChon\.suaDuoc \? \(/);
    });

    test('← → không cướp phím khi đang gõ hoặc có popup', () => {
        expect(cb).toMatch(/if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey \|\| laDangGo\(e\.target\)\) return;/);
        expect(cb).toMatch(/#modal-container\.active/);
        expect(cb).toMatch(/window\.removeEventListener\('keydown', onKey\)/);
    });

    test('mặc định giới hạn 8 lỗi, có nút xem tất cả', () => {
        expect(cb).toMatch(/const TOI_DA = 8;/);
        expect(cb).toMatch(/Xem tất cả \$\{ds\.length\} lỗi/);
    });

    test('sổ tay phím tắt có nhóm Chữa bài với đúng phím của component', () => {
        const g = NHOM_PHIM_TAT.find((n) => n.key === 'chua-bai');
        expect(g.screens).toEqual(['essay-screen', 'translation-screen']);
        expect(g.phim.flatMap((p) => [...p.phim, ...(p.hoac || [])])).toEqual(['←', '→', 'Enter']);
        expect(cb).toMatch(/if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); kiemTra\(dangChon\); \}/);
    });
});

describe('sổ tay lỗi', () => {
    const stl = doc('components', 'tienBo', 'SoTayLoi.jsx');
    const tb = doc('components', 'tienBo', 'TienBoScreen.jsx');

    test('là một tab của màn Tiến bộ; chỉ mount (và tải) khi mở tab', () => {
        expect(tb).toMatch(/\{tab === 'so-tay' && <SoTayLoi active=\{active\} \/>\}/);
        expect(stl).toMatch(/TienBoAPI\.soTayLoi\(\)/);
        expect(doc('api', 'tienBo.js')).toMatch(/Http\.get\('\/tien-bo\/so-tay-loi'\)/);
    });

    test('lọc theo loại lỗi và mức; Tự kiểm tra che cách sửa', () => {
        expect(stl).toMatch(/\(!loai \|\| m\.loai === loai\) && \(!muc \|\| m\.muc === muc\)/);
        expect(stl).toMatch(/const che = tuKiemTra && soDuoc && kq !== 'dung' && kq !== 'xem';/);
        expect(stl).toMatch(/\{!che && m\.sua && \(/);
    });
});
