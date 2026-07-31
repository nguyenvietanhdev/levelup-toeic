/**
 * Bước kiểm TRƯỚC khi trừ tiền phải thấy hết vật phẩm sắp phát
 * (SEC-be.economy-003).
 *
 * Vì sao cần: `Inventory.grant` ném lỗi khi itemId không có ItemDefinition.
 * Trước đây lỗi đó bị nuốt vào một dòng log SAU khi tiền đã trừ, và response
 * vẫn trả 'Item purchased successfully' — người mua mất tiền, không nhận được
 * gì, không ai biết. Một ký tự gõ nhầm trong trình soạn catalog là đủ.
 *
 * Cách vá là chặn trước khi tiền rời tài khoản, nên giá trị của nó phụ thuộc
 * hoàn toàn vào việc `collectGrantedItemIds` có liệt kê ĐỦ mọi đường phát hay
 * không. Sót một đường là quay lại đúng bug cũ, chỉ hiếm hơn. Đó là thứ file
 * này chốt.
 *
 * Pure, no DB.
 */
jest.mock('../models/UserStats', () => ({}));
jest.mock('../models/Transaction', () => ({}));
jest.mock('../models/ItemDefinition', () => ({}));
jest.mock('../models/ChannelConfig', () => ({}));
jest.mock('../services/inventoryService', () => ({}));
jest.mock('../services/gameConfig', () => ({ getGameConfig: jest.fn() }));
jest.mock('../services/balanceService', () => ({}));
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const { _collectGrantedItemIds: collect } = require('../controllers/shopController');

const sorted = (a) => [...a].sort();

describe('collectGrantedItemIds — mọi đường phát vật phẩm', () => {
    test('effect type "item" → chính itemId đó', () => {
        expect(collect({ itemId: 'goi-ve', effect: { type: 'item', itemId: 've-quay', amount: 3 } }, false))
            .toEqual(['ve-quay']);
    });

    test('effect "combo" → đệ quy hết các nhánh con', () => {
        const item = {
            itemId: 'combo-lon',
            effect: {
                type: 'combo',
                items: [
                    { type: 'item', itemId: 'a' },
                    { type: 'combo', items: [{ type: 'item', itemId: 'b' }, { type: 'coins', amount: 100 }] },
                ],
            },
        };
        expect(sorted(collect(item, false))).toEqual(['a', 'b']);
    });

    test('children được tính, kể cả khi effect không phát gì', () => {
        const item = { itemId: 'x', effect: { type: 'energy', amount: 50 }, children: [{ itemId: 'c1' }, { itemId: 'c2', quantity: 3 }] };
        expect(sorted(collect(item, false))).toEqual(['c1', 'c2']);
    });

    test('thẻ (on_use) tự phát chính nó', () => {
        expect(collect({ itemId: 'boost-xp-card', effect: { type: 'boost', boostType: 'xp' } }, true))
            .toEqual(['boost-xp-card']);
    });

    test('VIP kéo theo 3 vật phẩm ẩn — chỗ dễ sót nhất vì tên bị ghi cứng trong handler', () => {
        const byEffect = collect({ itemId: 'vip-week', effect: { type: 'vip', duration: 604800 } }, false);
        expect(sorted(byEffect)).toEqual(['bg-vip-week', 'boost-coins-card', 'boost-xp-card']);

        // Nhận diện VIP có hai đường: effect.type hoặc category.
        const byCategory = collect({ itemId: 'vip-week', category: 'vip', effect: { type: 'energy', amount: 1 } }, false);
        expect(sorted(byCategory)).toEqual(['bg-vip-week', 'boost-coins-card', 'boost-xp-card']);
    });

    test('gộp đủ mọi nguồn cùng lúc, không trùng lặp', () => {
        const item = {
            itemId: 'sieu-combo',
            category: 'vip',
            durationType: 'on_use',
            effect: { type: 'combo', items: [{ type: 'item', itemId: 'a' }, { type: 'item', itemId: 'a' }] },
            children: [{ itemId: 'b' }, { itemId: 'bg-vip-week' }],
        };
        const ids = collect(item, true);
        expect(sorted(ids)).toEqual(['a', 'b', 'bg-vip-week', 'boost-coins-card', 'boost-xp-card', 'sieu-combo']);
        expect(ids.length).toBe(new Set(ids).size); // không trùng
    });

    test('item không phát gì → danh sách rỗng, không tốn truy vấn', () => {
        expect(collect({ itemId: 'nap-day', effect: { type: 'energy_full' } }, false)).toEqual([]);
        expect(collect({ itemId: 'x' }, false)).toEqual([]);
    });

    test('dữ liệu méo không làm ném lỗi', () => {
        expect(collect({ itemId: 'x', effect: { type: 'combo' } }, false)).toEqual([]);
        expect(collect({ itemId: 'x', effect: { type: 'item' } }, false)).toEqual([]);
        expect(collect({ itemId: 'x', children: [null, {}, { itemId: 'ok' }] }, false)).toEqual(['ok']);
    });
});
