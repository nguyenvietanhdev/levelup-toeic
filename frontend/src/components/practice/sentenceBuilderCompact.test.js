/**
 * Xếp câu phải VỪA khung hình, không phải cuộn.
 *
 * Bố cục cũ: tiêu đề + hộp "Cách chơi" + hộp "Nghĩa của câu" + hộp "Gợi ý từ
 * vựng" xếp chồng, chiếm 294px — gần một nửa màn hình. Vùng chơi thật (ô thả
 * câu + kho từ + nút) chỉ 232px và bị đẩy xuống dưới mép: người học phải cuộn
 * mỗi câu, mà mỗi lượt có 5–10 câu.
 *
 * Ước tính trên màn 660px (như ảnh chụp): 622px nội dung / 476px chỗ hiển thị
 * → phải cuộn 146px. Sau khi gộp: 382px, dư 94px.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'modes', 'sentenceBuilder.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Thân một luật CSS. */
function luat(selector) {
    const i = css.indexOf(selector + ' {');
    expect(i, `không tìm thấy ${selector}`).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
}

describe('gợi ý gộp một hàng, không xếp chồng', () => {
    test('dùng cụm chip mới', () => {
        expect(src).toMatch(/class="sb-hints"/);
        expect(src).toMatch(/sb-hint--translation/);
        expect(src).toMatch(/sb-hint--word/);
    });

    test('CSS xếp NGANG và tự xuống dòng khi hẹp', () => {
        const body = luat('.sb-hints');
        expect(body).toMatch(/display:\s*flex/);
        expect(body).toMatch(/flex-wrap:\s*wrap/);
    });

    test('mỗi chip chia đôi hàng trên màn rộng', () => {
        // `flex: 1 1 <cơ sở>` cho hai chip chia đôi rồi tự xuống dòng — không
        // phải viết media query riêng.
        expect(luat('.sb-hint')).toMatch(/flex:\s*1 1 \d+px/);
    });

    test('câu dài xuống dòng TRONG chip, không đẩy chip tràn ra', () => {
        expect(luat('.sb-hint')).toMatch(/min-width:\s*0/);
        expect(luat('.sb-hint-value')).toMatch(/word-break/);
    });
});

describe('bỏ hộp "Cách chơi" khỏi luồng', () => {
    test('không còn khối instruction-box', () => {
        // Nó lặp lại đúng điều tiêu đề đã nói, đọc một lần là thuộc, mà chiếm
        // nguyên một khối mỗi câu.
        expect(src).not.toMatch(/class="instruction-box"/);
    });

    test('hướng dẫn vẫn còn, chuyển vào title của tiêu đề', () => {
        // Bỏ hẳn thì người mới không biết luật chơi.
        expect(src).toMatch(/class="sb-title" title="/);
        expect(src).toMatch(/theo thứ tự đúng/);
    });
});

describe('vùng chơi được nới chỗ', () => {
    test('ô thả câu nén lại', () => {
        // Cũ: min-height 120 + padding 24×2 + margin 24×2 = 192px cho MỘT ô thả,
        // nhiều hơn cả kho từ bên dưới.
        const body = luat('.sentence-area');
        const h = Number((body.match(/min-height:\s*(\d+)px/) || [])[1]);
        expect(h).toBeLessThan(120);
        // Sàn đủ cho MỘT hàng chip (38px) + đệm. Không đặt 84px cho hai hàng:
        // nó ngốn thêm 32px MỖI CÂU, mà chính 32px đó đẩy thanh ba nút (Gợi ý /
        // Dừng giờ / Bỏ qua) ra khỏi khung hình. Câu dài hơn một hàng thì ô tự
        // nở — giật một nhịp chấp nhận được, nút bấm không thấy thì không.
        expect(h).toBeGreaterThanOrEqual(46);
    });

    test('margin và padding không còn dùng spacing-xl', () => {
        const body = luat('.sentence-area');
        expect(body).not.toMatch(/padding:\s*var\(--spacing-xl\)/);
        expect(body).not.toMatch(/margin:\s*var\(--spacing-xl\) 0/);
    });
});

describe('không để lại CSS chết', () => {
    for (const cls of ['instruction-box', 'translation-hint-box', 'word-hint-box']) {
        test(`${cls} đã gỡ khỏi CSS`, () => {
            // Giữ luật cho class không markup nào dùng chỉ làm người đọc sau
            // tưởng nó còn hiệu lực.
            expect(css).not.toContain(`.${cls}`);
        });
    }
});

describe('chiều cao ước tính vừa khung hình', () => {
    test('tổng nội dung nhỏ hơn chỗ hiển thị trên màn 660px', () => {
        // Con số lấy từ CSS thật, không phải hằng số chép tay — sửa CSS mà quên
        // sửa test thì test này bắt được.
        const soPx = (sel, prop) => {
            const m = luat(sel).match(new RegExp(`${prop}:\\s*(\\d+)px`));
            return m ? Number(m[1]) : 0;
        };
        const oTha = soPx('.sentence-area', 'min-height');
        const chip = soPx('.sb-hint', 'padding') || 8;

        // Tiêu đề + hàng chip + ô thả + kho từ + nút, cộng khoảng cách.
        const tong = 46 + (chip * 2 + 20) + (16 + oTha + 16) + (16 + 88 + 12) + (16 + 44);
        const cho = 660 - 96 - 64 - 24;   // màn 660px trừ nav, header, đệm

        expect(tong).toBeLessThan(cho);
    });
});
