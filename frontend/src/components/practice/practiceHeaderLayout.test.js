/**
 * Thanh header màn luyện tập trên ĐIỆN THOẠI.
 *
 * Một hàng:  [←] [tên chế độ · 1/38] [⭐ ✓ ✗] [⏱]
 *
 * Trước đây `.practice-info` để `width: 100%` nên nó chiếm trọn hàng, đẩy thanh
 * điểm và đồng hồ xuống hàng riêng. Header cao gấp đôi mà vẫn LỆCH TRỤC: hai
 * nhóm bị đẩy xuống vẫn giữ `margin-bottom` và `padding` của luật cũ, mà
 * `align-items: center` căn theo hộp ĐÃ CỘNG margin.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'responsive.css'), 'utf8');
const jsx = readFileSync(join(__dirname, 'PracticeScreen.jsx'), 'utf8');

/** Thân một luật CSS trong khối @media mobile. */
function luat(selector) {
    const mobile = css.slice(0, css.indexOf('@media screen and (max-width: 768px)'));
    // Tìm theo DÒNG mở luật, không phải `indexOf` trên cả chuỗi: selector
    // `.practice-score-bar` còn nằm trong luật gộp
    // `.practice-header .practice-meta,\n.practice-score-bar {` phía trên, và
    // `indexOf` sẽ trúng cái đó trước rồi trả về sai thân luật.
    const lines = mobile.split('\n');
    const i = lines.findIndex((l) => l.trim() === `${selector} {`);
    expect(i, `không tìm thấy luật ${selector}`).toBeGreaterThan(-1);
    const rest = lines.slice(i + 1);
    return rest.slice(0, rest.findIndex((l) => l.trim() === '}')).join('\n');
}

describe('tất cả nằm MỘT hàng', () => {
    test('tên chế độ CO LẠI thay vì chiếm trọn hàng', () => {
        // `width: 100%` là thứ đã đẩy mọi nhóm khác xuống hàng dưới.
        const r = luat('.practice-info');
        expect(r).not.toMatch(/width:\s*100%/);
        expect(r).toMatch(/flex:\s*1 1 auto/);
    });

    test('tên chế độ cắt bằng ellipsis, kèm min-width: 0', () => {
        // Thiếu `min-width: 0` thì flex item không co dưới kích thước nội dung
        // và ellipsis KHÔNG BAO GIỜ kích hoạt — tên dài vẫn phá vỡ hàng.
        expect(luat('.practice-info')).toMatch(/min-width:\s*0/);
        const h2 = luat('.practice-info h2');
        expect(h2).toMatch(/text-overflow:\s*ellipsis/);
        expect(h2).toMatch(/white-space:\s*nowrap/);
    });

    test('thanh điểm và đồng hồ KHÔNG co lại', () => {
        // Chúng là các con số cố định; co lại là chữ bị cắt mất.
        expect(luat('.practice-score-bar')).toMatch(/flex-shrink:\s*0/);
        expect(luat('.practice-timer')).toMatch(/flex-shrink:\s*0/);
    });

    test('ba icon ⭐✓✗ không rớt xuống hai dòng', () => {
        // `flex-wrap: wrap` làm hàng header cao gấp đôi trên màn hẹp.
        expect(luat('.practice-score-bar')).toMatch(/flex-wrap:\s*nowrap/);
    });
});

describe('thẳng trục — không mục nào cao thấp lệch nhau', () => {
    test('thanh điểm bỏ margin và padding thừa', () => {
        // `align-items: center` căn theo hộp ĐÃ CỘNG margin, nên `margin-bottom`
        // đẩy nó cao hơn hàng đúng bằng số đó. Padding thì vô hình vì nền trong
        // suốt, chỉ làm hộp cao thêm.
        const r = luat('.practice-score-bar');
        expect(r).toMatch(/margin:\s*0/);
        expect(r).toMatch(/padding:\s*0/);
        expect(r).not.toMatch(/margin-bottom:\s*\d+px/);
    });

    test('cả ba nhóm cùng min-height với đồng hồ', () => {
        // Đồng hồ là mục duy nhất có nền riêng nên nó quyết định chiều cao hàng.
        // Cho các mục kia cùng chiều cao thì thẳng trục mà không phải canh margin.
        const cao = (r) => Number((r.match(/min-height:\s*(\d+)px/) || [])[1]);
        const timer = cao(luat('.practice-timer'));
        expect(timer).toBeGreaterThan(0);

        const chung = css.slice(
            css.indexOf('.practice-header .practice-meta'),
            css.indexOf('}', css.indexOf('.practice-header .practice-meta')));
        expect(chung).toContain('.practice-score-bar');
        expect(Number((chung.match(/min-height:\s*(\d+)px/) || [])[1])).toBe(timer);
    });

    test('đồng hồ tự căn giữa nội dung bên trong', () => {
        const r = luat('.practice-timer');
        expect(r).toMatch(/align-items:\s*center/);
    });
});

describe('không còn luật chết', () => {
    test('bỏ `.practice-timer-container` — không phần tử nào mang class đó', () => {
        // Luật cũ đặt `order: 0` và `position: static !important` cho một class
        // không tồn tại trong JSX; giữ lại chỉ gây hiểu nhầm khi đọc CSS.
        expect(css).not.toContain('practice-timer-container');
        expect(jsx).not.toContain('practice-timer-container');
    });
});

describe('markup khớp với giả định của CSS', () => {
    test('bốn nhóm là anh em trong .practice-header', () => {
        const i = jsx.indexOf('className="practice-header"');
        const header = jsx.slice(i, jsx.indexOf('practice-pace-bar', i));
        for (const c of ['practice-info', 'practice-score-bar', 'practice-timer']) {
            expect(header).toContain(c);
        }
    });

    test('tiến độ "1 / 38" nằm TRONG practice-info', () => {
        // CSS căn nó theo `.practice-info`, không phải theo header.
        const i = jsx.indexOf('className="practice-info"');
        const info = jsx.slice(i, jsx.indexOf('practice-score-bar', i));
        expect(info).toContain('practice-meta');
        expect(info).toContain('practice-progress');
    });
});
