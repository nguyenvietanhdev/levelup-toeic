/**
 * Header luyện tập: tên chế độ + badge + số câu trên MỘT hàng.
 *
 * Xếp hai dòng thì header cao thêm ~22px mà dòng dưới chỉ có một badge và hai
 * con số — chiều cao đó lấy mất chỗ của vùng chơi.
 *
 * Và Flashcard KHÔNG lặp lại số câu / Known / Unknown: thanh header đã hiện
 * đúng những con số đó rồi.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
const fc = readFileSync(join(__dirname, 'modes', 'flashcard.js'), 'utf8');

/** Khối `.practice-info` gộp một hàng (khối nén, ngoài mọi media query). */
const khoiInfo = () => {
    // Neo vào LẦN XUẤT HIỆN SAU: `.practice-info` khai hai lần — bản gốc ở
    // trên (căn giữa) và bản nén ở dưới. Bản nén mới là bản đang có hiệu lực.
    // Dùng `\n` trong chuỗi neo thì trượt, vì file lưu CRLF.
    const i = css.lastIndexOf('.practice-info {');
    expect(i).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
};

describe('tiêu đề và số câu cùng một hàng', () => {
    test('`.practice-info` xếp ngang', () => {
        const t = khoiInfo();
        expect(t).toMatch(/display: flex/);
        expect(t).toMatch(/align-items: center/);
    });

    test('cho xuống dòng khi quá chật', () => {
        // Màn rất hẹp mà ép một hàng thì chữ bị cắt cụt.
        expect(khoiInfo()).toMatch(/flex-wrap: wrap/);
    });

    test('tên chế độ CO LẠI trước, không phải số câu', () => {
        // Cắt bớt tên chế độ vẫn đọc được; "2 / 19" mà mất chữ số thì vô nghĩa.
        // `lastIndexOf`: các selector này khai HAI lần (bản gốc căn giữa ở
        // trên, bản nén ở dưới). Bản nén mới là bản đang có hiệu lực.
        const i = css.lastIndexOf('.practice-info h2 {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/flex-shrink: 1/);
        const j = css.lastIndexOf('.practice-meta {');
        expect(css.slice(j, css.indexOf('}', j))).toMatch(/flex-shrink: 0/);
    });

    test('áp dụng ở MỌI khổ màn hình, không kẹt trong media query', () => {
        // Nằm trong `@media` thì màn rộng không đổi gì.
        const i = css.lastIndexOf('.practice-info {');
        const truoc = css.slice(0, i);
        const mo = (truoc.match(/\{/g) || []).length;
        const dong = (truoc.match(/\}/g) || []).length;
        expect(mo - dong).toBe(0);
    });
});

describe('Flashcard bỏ thanh lặp', () => {
    test('không còn khối `flashcard-progress`', () => {
        expect(fc).not.toMatch(/class="flashcard-progress"/);
    });

    test('không còn Known / Unknown trong giao diện', () => {
        expect(fc).not.toMatch(/Known \$\{this\.knownWords\.length\}/);
        expect(fc).not.toMatch(/Unknown \$\{this\.unknownWords\.length\}/);
    });

    test('VẪN gọi `recordAnswer` — header lấy số từ đây', () => {
        // Bỏ hiển thị chứ không bỏ ghi nhận: mất cái này thì ✓/✗ trên header
        // đứng yên và số liệu chế độ cũng sai theo.
        expect(fc).toMatch(/markAsKnown\(word\) \{[\s\S]{0,200}recordAnswer\(true, word\)/);
        expect(fc).toMatch(/markAsUnknown\(word\) \{[\s\S]{0,200}recordAnswer\(false, word\)/);
    });

    test('VẪN gọi `updateProgress` — header lấy số câu từ đây', () => {
        expect(fc).toMatch(/PracticeManager\.updateProgress\(/);
    });

    test('vẫn giữ mảng `unknownWords` cho màn kết thúc', () => {
        // Màn kết thúc có nút "Ôn lại N từ chưa biết" đọc mảng này.
        expect(fc).toMatch(/this\.unknownWords\.push\(word\)/);
        expect(fc).toMatch(/Ôn lại \$\{this\.unknownWords\.length\} từ chưa biết/);
    });

    test('CSS mồ côi đã dọn', () => {
        // Để lại thì lần sau có người tưởng khối đó còn dùng.
        expect(css).not.toMatch(/^\.flashcard-progress \{/m);
        expect(css).not.toMatch(/^\.stat-known \{/m);
        expect(css).not.toMatch(/^\.stat-unknown \{/m);
        expect(css).not.toMatch(/\[data-theme="dark"\] \.flashcard-progress/);
    });
});

describe('chiều cao header', () => {
    /** Mọi khối `.practice-header { … }` theo thứ tự trong file. */
    const cacKhoi = () =>
        [...css.matchAll(/\.practice-header \{([^}]*)\}/g)].map((m) => m[1]);

    test('padding dọc cắt xuống `sm`, không còn `md`', () => {
        // Khai báo SAU thắng trong CSS — phải là khối cuối cùng có `padding`.
        const coPadding = cacKhoi().filter((k) => /padding:/.test(k));
        expect(coPadding.length).toBeGreaterThan(0);
        const cuoi = coPadding[coPadding.length - 1];
        expect(cuoi).toMatch(/padding: var\(--spacing-sm\) var\(--spacing-md\)/);
    });

    test('nút quay lại nhỏ lại TRONG header này thôi', () => {
        // `.icon-btn` dùng chung toàn app (thanh điều hướng, popup) — sửa ở gốc
        // là đổi luôn những chỗ chưa ai than phiền.
        const i = css.indexOf('.practice-header .icon-btn {');
        expect(i).toBeGreaterThan(-1);
        const rule = css.slice(css.indexOf('{', i), css.indexOf('}', i));
        expect(rule).toMatch(/height: 34px/);
    });

    test('KHÔNG sửa `.icon-btn` gốc', () => {
        const base = readFileSync(
            join(__dirname, '..', '..', 'assets', 'styles', 'base.css'), 'utf8');
        const i = base.indexOf('.icon-btn {');
        const rule = base.slice(base.indexOf('{', i), base.indexOf('}', i));
        expect(rule).toMatch(/height: 40px/);
    });

    test('vẫn trên ngưỡng chạm tối thiểu', () => {
        // Dưới 32px là quá nhỏ để bấm chắc tay trên màn cảm ứng.
        const i = css.indexOf('.practice-header .icon-btn {');
        const rule = css.slice(css.indexOf('{', i), css.indexOf('}', i));
        const px = Number((rule.match(/height: (\d+)px/) || [])[1]);
        expect(px).toBeGreaterThanOrEqual(32);
    });
});
