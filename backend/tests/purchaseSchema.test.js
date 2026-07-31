/**
 * Chốt schema của đường mua hàng và túi đồ (SEC-be.economy-002).
 *
 * Vì sao cần: `shopPurchase` từng chỉ khai `required`, mà `required` chỉ loại
 * undefined/null/chuỗi rỗng. Gửi `itemId` dạng object thì:
 *   1. object đó đi thẳng vào filter của Mongo (repo không có sanitizer nào —
 *      `express-mongo-sanitize` đã gỡ vì cài mà không mount);
 *   2. `COOLDOWN_DAYS[itemId]` tra bằng khoá object → JS ép về '[object Object]'
 *      → undefined → cooldownDays = 0.
 * Cái thứ hai làm bay CẢ BA chốt của giới hạn mua theo chu kỳ cùng lúc: ép
 * quantity về 1, kiểm "chờ N ngày", và ghi mốc để tái vũ trang. Gói giới hạn
 * 1 lần/tuần trở thành mua 99 gói tuỳ thích.
 *
 * Pure, no DB: chạy thẳng middleware validate với req/res/next giả.
 */
const validate = require('../middleware/validate');
const { shopPurchase, inventoryItem, inventorySlot } = require('../validators/schemas');

/** Chạy validate(schema) trên một body, trả về lỗi mà nó chuyển cho next(). */
function run(schema, body) {
    let err = null;
    validate(schema)({ body }, {}, (e) => { err = e || null; });
    return err;
}

describe('shopPurchase — itemId phải là chuỗi', () => {
    test('chuỗi hợp lệ → qua', () => {
        expect(run(shopPurchase, { itemId: 'shields-pack' })).toBeNull();
    });

    test.each([
        ['object rỗng', {}],
        ['toán tử Mongo', { $gt: '' }],
        ['regex', { $regex: '^shields' }],
    ])('itemId dạng %s → chặn', (_label, payload) => {
        const err = run(shopPurchase, { itemId: payload });
        expect(err).not.toBeNull();
        expect(err.statusCode).toBe(400);
    });

    test('itemId dạng mảng → chặn', () => {
        expect(run(shopPurchase, { itemId: ['a'] })).not.toBeNull();
    });

    test('itemId dạng số → chặn', () => {
        expect(run(shopPurchase, { itemId: 123 })).not.toBeNull();
    });

    test('thiếu itemId vẫn giữ nguyên câu chữ cũ', () => {
        const err = run(shopPurchase, {});
        expect(err.message).toBe('Item ID is required');
    });
});

describe('shopPurchase — quantity phải là số khi có mặt', () => {
    test('vắng mặt → qua (client cũ không gửi vẫn chạy)', () => {
        expect(run(shopPurchase, { itemId: 'x' })).toBeNull();
    });

    test('số → qua', () => {
        expect(run(shopPurchase, { itemId: 'x', quantity: 5 })).toBeNull();
    });

    test.each([['chuỗi', '5'], ['object', { $gt: 0 }], ['mảng', [5]]])(
        'quantity dạng %s → chặn', (_label, q) => {
            expect(run(shopPurchase, { itemId: 'x', quantity: q })).not.toBeNull();
        },
    );
});

describe('inventory — cùng luật, không còn kiểm tay trong route', () => {
    test('itemId object bị chặn ở /use và /equip', () => {
        expect(run(inventoryItem, { itemId: { $ne: null } })).not.toBeNull();
        expect(run(inventoryItem, { itemId: 'boost-xp-card' })).toBeNull();
    });

    test('slot object bị chặn ở /unequip', () => {
        expect(run(inventorySlot, { slot: { $ne: null } })).not.toBeNull();
        expect(run(inventorySlot, { slot: 'background' })).toBeNull();
    });

    test('câu chữ giữ nguyên như route trả trước đây', () => {
        expect(run(inventoryItem, {}).message).toBe('Thiếu itemId');
        expect(run(inventorySlot, {}).message).toBe('Thiếu slot');
    });
});

describe('routes/inventory.js — luật ở MỘT chỗ, không lặp lại ở call site', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'inventory.js'), 'utf8');

    test('3 route ghi đều gắn validate()', () => {
        for (const p of ['/use', '/equip', '/unequip']) {
            const line = src.split('\n').find(l => l.includes(`router.post('${p}'`));
            expect(line).toBeDefined();
            expect(line).toMatch(/validate\(/);
        }
    });

    test('không còn kiểm `if (!itemId)` / `if (!slot)` viết tay trong handler', () => {
        // Giữ cả hai là đúng hình dạng SYS-001: một luật, hai nơi, rồi lệch nhau.
        expect(src).not.toMatch(/if \(!itemId\)/);
        expect(src).not.toMatch(/if \(!slot\)/);
    });
});
