const { deriveType, badEffect, badListing } = require('../utils/itemDefRules');

describe('deriveType — type quyết định item hiện ở tab nào trong túi đồ', () => {
    test('cosmetic → cosmetic_* (giữ logic trang bị theo slot)', () => {
        expect(deriveType('avatar')).toBe('cosmetic_avatar');
        expect(deriveType('background')).toBe('cosmetic_background');
        expect(deriveType('frame')).toBe('cosmetic_frame');
    });

    test('boost → "boost" (bug cũ: ép về "item" làm thẻ tăng tốc vô hình trong túi)', () => {
        expect(deriveType('boost', 'item')).toBe('boost');
    });

    test('consumable/ticket → "consumable"', () => {
        expect(deriveType('consumable')).toBe('consumable');
        expect(deriveType('ticket', 'consumable')).toBe('consumable');
    });

    test('danh mục không có tab riêng thì GIỮ type cũ, không hạ về "item"', () => {
        expect(deriveType('energy', 'service')).toBe('service');
        expect(deriveType('cosmetic', 'service')).toBe('service');
    });

    test('không có type cũ thì mới về "item"', () => {
        expect(deriveType('bundle')).toBe('item');
        expect(deriveType('')).toBe('item');
        expect(deriveType(undefined)).toBe('item');
    });
});

describe('badEffect — chặn thẻ boost chết trước khi lưu', () => {
    const ok = { type: 'boost', boostType: 'energy', multiplier: 2, duration: 86400 };

    test('thẻ hợp lệ thì cho qua', () => {
        expect(badEffect(ok)).toBeNull();
        expect(badEffect({ ...ok, boostType: 'xp' })).toBeNull();
        expect(badEffect({ ...ok, boostType: 'coins' })).toBeNull();
    });

    test('boostType rỗng bị chặn (bug cũ: select thiếu option energy → lưu "")', () => {
        expect(badEffect({ ...ok, boostType: '' })).toMatch(/boostType/);
        expect(badEffect({ ...ok, boostType: undefined })).toMatch(/boostType/);
        expect(badEffect({ ...ok, boostType: 'nang-luong' })).toMatch(/boostType/);
    });

    test('hệ số ≤ 1 hoặc thời lượng ≤ 0 bị chặn (thẻ mua về không đổi gì)', () => {
        expect(badEffect({ ...ok, multiplier: 1 })).toMatch(/Hệ số/);
        expect(badEffect({ ...ok, multiplier: 0 })).toMatch(/Hệ số/);
        expect(badEffect({ ...ok, duration: 0 })).toMatch(/Thời lượng/);
    });

    test('effect không phải boost thì không can thiệp', () => {
        expect(badEffect({ type: 'energy_full' })).toBeNull();
        expect(badEffect({ slot: 'background', key: 'bg-neon' })).toBeNull();
        expect(badEffect(undefined)).toBeNull();
    });
});

describe('badListing — vật phẩm bày bán phải có danh mục', () => {
    test('có giá + xuất bản nhưng danh mục rỗng → CHẶN (bug cũ: gói "Nạp đầy ⚡" mất khỏi cửa hàng)', () => {
        expect(badListing({ category: '', published: true, price: 200 })).toMatch(/danh mục/);
        expect(badListing({ category: '   ', published: true, price: 200 })).toMatch(/danh mục/);
        expect(badListing({ published: true, price: 200 })).toMatch(/danh mục/);
    });

    test('có danh mục thì cho qua', () => {
        expect(badListing({ category: 'energy', published: true, price: 200 })).toBeNull();
    });

    test('chưa xuất bản hoặc không bán (price 0) thì không bắt buộc danh mục', () => {
        expect(badListing({ category: '', published: false, price: 200 })).toBeNull();
        expect(badListing({ category: '', published: true, price: 0 })).toBeNull();
        expect(badListing({ category: '', published: true })).toBeNull();
    });
});
