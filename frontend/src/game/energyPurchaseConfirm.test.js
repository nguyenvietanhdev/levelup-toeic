/**
 * Popup "Hết năng lượng" phải HỎI LẠI trước khi trừ tiền.
 *
 * Trước đây bấm một cái vào gói là mua luôn. Nguy hiểm vì popup này bật ra ĐÚNG
 * lúc người dùng đang bấm để vào bài — rất dễ bấm tiếp theo quán tính rồi mất
 * tiền mà chưa kịp đọc. Màn Cửa hàng bán đúng những vật phẩm này thì lại CÓ
 * bước xác nhận (`PurchaseConfirm`); không có lý do gì chỗ nguy hiểm hơn lại
 * lỏng hơn.
 *
 * Và mua xong phải VÀO BÀI LUÔN: không nối `onBought` thì người dùng trả tiền
 * xong bị trả về màn cũ, phải tự bấm "Luyện tập" lần nữa — trông như mua hụt.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const shop = readFileSync(join(__dirname, 'energyShop.js'), 'utf8');
const pm = readFileSync(
    join(__dirname, '..', 'components', 'practice', 'practiceManager.js'), 'utf8');

/** Thân handler click của nút gói năng lượng. */
const clickHandler = (() => {
    const i = shop.indexOf(".energy-pack-btn'");
    expect(i).toBeGreaterThan(-1);
    const j = shop.indexOf('this._stopCountdown();', shop.indexOf('_timer = setInterval', i));
    return shop.slice(i, j > i ? j : i + 3000);
})();

describe('xác nhận trước khi trừ tiền', () => {
    test('có bước hỏi lại trước khi gọi buy()', () => {
        const confirm = clickHandler.indexOf("title: 'Xác nhận mua'");
        const buy = clickHandler.indexOf('await this.buy(pack)');
        expect(confirm).toBeGreaterThan(-1);
        expect(buy).toBeGreaterThan(-1);
        expect(confirm).toBeLessThan(buy);
    });

    test('bấm Hủy thì KHÔNG mua', () => {
        expect(clickHandler).toMatch(/if \(!agreed\)/);
        // `return` phải nằm trước lệnh mua.
        const ret = clickHandler.indexOf('if (!agreed)');
        const buy = clickHandler.indexOf('await this.buy(pack)');
        expect(ret).toBeLessThan(buy);
    });

    test('nêu rõ giá và thứ sẽ nhận', () => {
        // "Xác nhận?" trống không thì người dùng vẫn không biết mình trả bao nhiêu.
        expect(clickHandler).toMatch(/\$\{pack\.price\}/);
        expect(clickHandler).toMatch(/\$\{pack\.name\}/);
    });

    test('Hủy thì dựng LẠI popup năng lượng', () => {
        // Modal.show của hộp xác nhận ĐÈ mất popup năng lượng; không dựng lại
        // thì bấm Hủy là mất cả hai, người dùng rơi về màn trước không hiểu gì.
        expect(clickHandler).toMatch(/this\.showModal\(\{ needed, onBought \}\)/);
    });

    test('không cho đóng bằng nền — tránh treo lời hứa', () => {
        // `closeOnBackdrop` mặc định cho đóng; đóng kiểu đó thì không ai gọi
        // resolve, `await` treo vĩnh viễn và nút gói kẹt luôn.
        expect(clickHandler).toMatch(/closeOnBackdrop: false/);
    });
});

describe('mua xong vào bài luôn', () => {
    test('practiceManager truyền onBought ở CẢ HAI lối', () => {
        // Lối 1: client chặn sớm vì thiếu ⚡.
        // Lối 2: server từ chối (nguồn sự thật) — cũng phải nối, không thì mua
        // xong vẫn đứng im.
        const hits = pm.match(/onBought: \(\) => \{ this\.start\(mode\); \}/g) || [];
        expect(hits.length).toBe(2);
    });

    test('gọi lại đúng mode vừa chọn', () => {
        expect(pm).toMatch(/Energy\.showRefillModal\(\{[\s\S]{0,160}needed: energyCost,[\s\S]{0,160}onBought/);
    });
});
