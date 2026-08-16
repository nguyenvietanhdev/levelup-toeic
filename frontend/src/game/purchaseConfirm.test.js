/**
 * Ô tick "không hỏi lại" cho hai popup tiêu xu giữa phiên luyện tập.
 *
 * Người dùng bấm gợi ý liên tục thì mỗi lần một hộp xác nhận là phiền. Cho tắt,
 * nhưng CHỈ trong phiên: đây là tuỳ chọn bỏ chốt an toàn cho việc TRỪ TIỀN, lưu
 * vĩnh viễn thì tắt một lần rồi quên, vài tuần sau bấm nhầm mất xu mà không
 * hiểu vì sao không thấy hỏi nữa.
 *
 * Dùng CHUNG một công tắc cho popup gợi ý (50 xu) và popup năng lượng
 * (150–250 xu) — tắt ở cái này thì cái kia cũng thôi hỏi.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PurchaseConfirm } from './purchaseConfirm.js';

const shop = readFileSync(join(__dirname, 'energyShop.js'), 'utf8');
const pm = readFileSync(
    join(__dirname, '..', 'components', 'practice', 'practiceManager.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('công tắc trong bộ nhớ', () => {
    beforeEach(() => PurchaseConfirm.reset());

    test('mặc định VẪN hỏi', () => {
        expect(PurchaseConfirm.shouldSkip()).toBe(false);
    });

    test('tick rồi thì thôi hỏi', () => {
        PurchaseConfirm.setSkip(true);
        expect(PurchaseConfirm.shouldSkip()).toBe(true);
    });

    test('reset() đưa về hỏi lại', () => {
        PurchaseConfirm.setSkip(true);
        PurchaseConfirm.reset();
        expect(PurchaseConfirm.shouldSkip()).toBe(false);
    });

    test('ép về boolean — giá trị lạ không lọt vào', () => {
        PurchaseConfirm.setSkip('có');
        expect(PurchaseConfirm.shouldSkip()).toBe(true);
        PurchaseConfirm.setSkip(undefined);
        expect(PurchaseConfirm.shouldSkip()).toBe(false);
    });

    test('KHÔNG ghi localStorage — chỉ sống trong phiên', () => {
        // Ghi xuống là thành vĩnh viễn, đúng thứ ta cố tránh.
        //
        // Bỏ COMMENT trước khi dò: phần chú thích đầu file có nhắc `localStorage`
        // để giải thích vì sao KHÔNG dùng nó — dò thẳng là đọc trúng chính lời
        // văn của mình và test đỏ oan.
        const src = readFileSync(join(__dirname, 'purchaseConfirm.js'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter((l) => !/^\s*(\/\/|\*)/.test(l))
            .join('\n');
        expect(src).not.toMatch(/localStorage/);
        expect(src).not.toMatch(/GameState\.save/);
    });
});

describe('phiên mới thì hỏi lại', () => {
    test('practiceManager gọi reset() lúc bắt đầu phiên', () => {
        // Không reset thì "chỉ trong lượt này" thành "cho tới khi F5": thoát
        // bài, vào bài khác, vẫn bị trừ thẳng.
        expect(pm).toMatch(/PurchaseConfirm\.reset\(\)/);
    });

    test('reset nằm SAU khi đã qua các cửa chặn', () => {
        // Đặt ở đầu start() thì phiên hỏng giữa chừng (thiếu ⚡, chưa chọn đề)
        // cũng xoá mất lựa chọn người dùng vừa tick.
        const reset = pm.indexOf('PurchaseConfirm.reset()');
        const bgm = pm.indexOf('startPracticeBgm(BGM_VOLUME)');
        expect(reset).toBeGreaterThan(bgm);
    });
});

describe('popup mua gợi ý', () => {
    test('có ô tick', () => {
        expect(pm).toMatch(/id="skip-purchase-confirm"/);
        expect(pm).toMatch(/Không hỏi lại trong lượt luyện tập này/);
    });

    test('đã tick thì mua THẲNG, không dựng popup', () => {
        expect(pm).toMatch(/if \(PurchaseConfirm\.shouldSkip\(\)\) \{\s*doBuy\(\);/);
    });

    test('hai lối mua dùng CHUNG một hàm', () => {
        // Chép tay hai bản thì sửa một chỗ là hai lối lệch nhau.
        expect(pm).toMatch(/const doBuy = \(\) =>/);
        expect((pm.match(/doBuy\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    test('đọc ô tick TRƯỚC khi đóng modal', () => {
        // Đóng rồi thì React đã gỡ thẻ, getElementById trả null.
        const i = pm.indexOf("getElementById('skip-purchase-confirm')");
        const j = pm.indexOf('Modal.close()', i);
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
    });

    test('bấm Hủy KHÔNG ghi nhận ô tick', () => {
        // Vừa từ chối mua thì hiểu là "thôi", không phải "cứ trừ đi".
        const i = pm.indexOf("text: 'Hủy'");
        const body = pm.slice(i, i + 260);
        expect(body).not.toMatch(/setSkip/);
    });
});

describe('popup hết năng lượng — CHUNG công tắc', () => {
    test('cũng có ô tick', () => {
        expect(shop).toMatch(/id="skip-purchase-confirm"/);
    });

    test('đã tick thì bỏ qua hộp xác nhận', () => {
        expect(shop).toMatch(/PurchaseConfirm\.shouldSkip\(\) \|\| await new Promise/);
    });

    test('ghi nhận ô tick ở nút Mua', () => {
        // Cắt tới hết nút Mua (dấu đóng `},` của nó), không cắt theo số ký tự
        // cố định — thêm một dòng chú thích là cửa sổ lại hụt, test đỏ oan.
        const i = shop.indexOf("text: 'Mua'");
        expect(i).toBeGreaterThan(-1);
        const j = shop.indexOf('resolve(true)', i);
        expect(j).toBeGreaterThan(i);
        expect(shop.slice(i, j)).toMatch(/PurchaseConfirm\.setSkip\(true\)/);
    });

    test('nút Hủy KHÔNG ghi nhận', () => {
        const i = shop.indexOf("text: 'Hủy'");
        const body = shop.slice(i, i + 200);
        expect(body).not.toMatch(/setSkip/);
    });
});

describe('kiểu ô tick', () => {
    test('có lớp .purchase-skip', () => {
        expect(css).toMatch(/\.purchase-skip\s*\{/);
    });

    test('nhạt hơn nội dung chính — không tranh chú ý', () => {
        const r = css.match(/\.purchase-skip\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/var\(--text-secondary\)/);
    });
});
