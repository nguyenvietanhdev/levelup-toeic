/**
 * Dấu hiệu ĐANG THU ÂM trong popup Dịch nhanh.
 *
 * Trước đây giữ Shift thì micro chạy nhưng giao diện KHÔNG đổi gì cả — người
 * dùng không biết máy đã bắt đầu nghe chưa. Hậu quả thực tế: nhả phím quá sớm,
 * không thu được gì, rồi tưởng tính năng hỏng.
 *
 * Trớ trêu là state `listening` ĐÃ có sẵn (`setListening(on)` trong
 * `onStateChange`), chỉ là chưa ai hiển thị nó ra.
 *
 * Ba chỗ dễ hỏng:
 *   1. Chỉ dựa vào chuyển động → người tắt hiệu ứng (prefers-reduced-motion)
 *      không thấy gì.
 *   2. Nhãn FROM có `text-transform: uppercase` → "Đang nghe…" thành "ĐANG NGHE…".
 *   3. `onStart` xoá trắng ô nguồn → không đổi placeholder thì ô trống trơn,
 *      càng giống app bị treo.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const jsx = readFileSync(join(__dirname, 'TranslateModal.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('có dấu hiệu khi đang nghe', () => {
    test('hiện cụm ba chấm + chữ, gắn với state `listening`', () => {
        expect(jsx).toMatch(/\{listening && \(/);
        expect(jsx).toMatch(/className="translate-listening"/);
        expect(jsx).toMatch(/Đang nghe…/);
    });

    test('đủ BA chấm để tạo hiệu ứng nối nhau', () => {
        const i = jsx.indexOf('className="translate-listening"');
        const block = jsx.slice(i, i + 400);
        expect((block.match(/className="tl-dot"/g) || []).length).toBe(3);
    });

    test('ô nguồn cũng đổi trạng thái, không chỉ cái nhãn', () => {
        expect(jsx).toMatch(/translate-input\$\{listening \? ' is-listening' : ''\}/);
        expect(css).toMatch(/\.translate-input\.is-listening\s*\{/);
    });

    test('placeholder nói rõ đang chờ giọng', () => {
        // `onStart` xoá trắng ô — không đổi placeholder thì ô trống trơn.
        expect(jsx).toMatch(/listening \? '🎤 Đang nghe… nói đi'/);
    });
});

describe('không chỉ dựa vào chuyển động', () => {
    test('có CHỮ kèm theo, không chỉ ba chấm nảy', () => {
        const i = jsx.indexOf('className="translate-listening"');
        expect(jsx.slice(i, i + 400)).toMatch(/Đang nghe…/);
    });

    test('tắt hiệu ứng thì chấm ĐỨNG YÊN chứ không biến mất', () => {
        // `display: none` ở đây là xoá luôn dấu hiệu của người cần nó nhất.
        const i = css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('.tl-dot'));
        expect(i).toBeGreaterThan(-1);
        const block = css.slice(i, i + 200);
        expect(block).toMatch(/animation:\s*none/);
        expect(block).toMatch(/opacity:\s*1/);
        expect(block).not.toMatch(/display:\s*none/);
    });

    test('báo cho trình đọc màn hình', () => {
        expect(jsx).toMatch(/role="status"/);
        expect(jsx).toMatch(/aria-live="polite"/);
    });
});

describe('hiển thị đúng chữ', () => {
    test('không bị viết hoa theo nhãn FROM', () => {
        // `.translate-modal .translate-label` có `text-transform: uppercase`, mà
        // thuộc tính này KẾ THỪA — không ghi đè thì thành "ĐANG NGHE…".
        expect(css).toMatch(/\.translate-modal \.translate-label\s*\{[^}]*text-transform:\s*uppercase/);
        const r = css.match(/\.translate-listening\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/text-transform:\s*none/);
    });

    test('ba chấm lệch pha để nảy nối nhau', () => {
        expect(css).toMatch(/\.tl-dot:nth-child\(2\)\s*\{[^}]*animation-delay/);
        expect(css).toMatch(/\.tl-dot:nth-child\(3\)\s*\{[^}]*animation-delay/);
    });
});

describe('state vốn đã có, chỉ là chưa hiện', () => {
    test('`listening` được cập nhật từ onStateChange', () => {
        expect(jsx).toMatch(/onStateChange: \(on\) => \{\s*\n\s*setListening\(on\)/);
    });
});
