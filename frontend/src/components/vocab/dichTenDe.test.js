/**
 * Bấm ICON của thẻ đề/Part → dịch tên đề.
 *
 * Tên đề nhiều khi là chữ Hán (`基本问候`) hoặc tiếng Anh chuyên ngành
 * (`ADVERBS OF FREQUENCY`) — nhìn không đoán được nội dung, mà phải chọn thử
 * rồi thoát ra mới biết.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...p) => readFileSync(join(__dirname, ...p), 'utf8');
const helper = F('dichTenDe.js');
const modal = F('topic', 'TopicModal.jsx');
const part = F('part', 'partSelector.js');
const tran = F('..', 'translate', 'TranslateModal.jsx');
const css = F('..', '..', 'assets', 'styles', 'components.css');

describe('không phá thao tác chọn', () => {
    test('CHẶN nổi bọt — bấm icon không kéo theo chọn đề', () => {
        // Thẻ cha có handler chọn; không chặn thì một cú bấm vừa dịch vừa chọn,
        // và popup dịch mở ra trên một màn hình vừa chuyển.
        expect(helper).toMatch(/e\.stopPropagation\(\)/);
    });

    test('tên rỗng thì không mở popup', () => {
        expect(helper).toMatch(/if \(!text\) return/);
    });

    test('dùng đúng event có sẵn, không tự mở popup', () => {
        expect(helper).toMatch(/GameEvents\.TRANSLATE_REQUESTED/);
    });
});

describe('gắn ở CẢ BỐN chỗ có icon', () => {
    test('ba loại thẻ trong popup chọn đề', () => {
        // Đề chung, bộ riêng/chia sẻ, nhóm từ sai.
        expect((modal.match(/onClick=\{\(e\) => dichTenDe\(/g) || []).length).toBe(3);
    });

    test('thẻ Part cũng có', () => {
        expect(part).toMatch(/data-dich="\$\{part\}"/);
        expect(part).toMatch(/dichTenDe\(e, icon\.dataset\.dich\)/);
    });

    test('dùng helper CHUNG, không chép logic', () => {
        // Bốn chỗ chép rời là bốn chỗ để quên `stopPropagation`.
        expect(modal).toMatch(/from '\.\.\/dichTenDe\.js'/);
        expect(part).toMatch(/from '\.\.\/dichTenDe\.js'/);
    });
});

describe('người dùng biết icon bấm được', () => {
    test('có gợi ý khi rê chuột', () => {
        expect(helper).toMatch(/title: `Dịch "\$\{ten\}"`/);
    });

    test('con trỏ đổi hình', () => {
        expect(helper).toMatch(/cursor: 'help'/);
    });

    test('trình đọc màn hình nhận ra là nút', () => {
        expect(helper).toMatch(/role: 'button'/);
        expect(helper).toMatch(/tabIndex: 0/);
    });
});

describe('popup dịch nổi TRÊN modal đang mở', () => {
    test('phát hiện đang chồng lên modal khác', () => {
        // `translate-layer` cố ý thấp hơn modal một bậc để popup Yêu thích che
        // được nó. Mở từ trong popup chọn đề thì thấp hơn = nằm khuất phía sau,
        // người dùng bấm mà tưởng không có gì xảy ra.
        // Soi BIỂU THỨC thật, không phải "có tên biến đó": `false && ...` vẫn
        // khớp tên mà popup thì không bao giờ nổi lên.
        expect(tran).toMatch(
            /const chongLenModal = typeof document !== 'undefined'\s*&& document\.querySelectorAll\('#modal-container\.active'\)\.length > 0/
        );
    });

    test('thêm lớp riêng, KHÔNG sửa `translate-layer`', () => {
        // Luật cũ vẫn đúng cho trường hợp thường.
        expect(tran).toMatch(/translate-tren-cung/);
        const i = css.indexOf('#modal-container.translate-layer {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/var\(--z-modal\) - 1/);
    });

    test('lớp mới nâng lên TRÊN modal', () => {
        const i = css.indexOf('#modal-container.translate-layer.translate-tren-cung');
        expect(i).toBeGreaterThan(-1);
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/var\(--z-modal\) \+ 1/);
    });
});
