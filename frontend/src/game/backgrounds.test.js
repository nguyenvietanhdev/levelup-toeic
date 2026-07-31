/**
 * Nền cosmetic: ảnh admin upload PHẢI thắng gradient dự phòng, và việc nạp
 * catalog phải báo cho React vẽ lại.
 *
 * Bug đã gặp: nền mua ở cửa hàng có ảnh hẳn hoi nhưng hồ sơ/BXH/túi đồ toàn ra
 * màu gradient — vì catalog về SAU khi màn đã render, mà gán vào object cấp
 * module thì React không biết đường vẽ lại.
 */
import { describe, test, expect, vi } from 'vitest';
import { BACKGROUNDS, registerBackgroundCosmetics, bgStyle, bgKeyForUser } from './backgrounds.js';
import { subscribeCosmetics, cosmeticsVersion } from './cosmeticsStore.js';

const oceanItem = {
    itemId: 'bg-ocean',
    name: 'Nền Đại dương',
    image: '/uploads/background/bg-ocean-1785336961547.png',
    effect: { slot: 'background', key: 'bg-ocean', styleMode: 'image' },
};

describe('registerBackgroundCosmetics', () => {
    test('ảnh từ catalog đè lên gradient hardcoded', () => {
        expect(bgStyle('bg-ocean').backgroundImage).not.toContain('url(');

        registerBackgroundCosmetics([oceanItem]);

        const style = bgStyle('bg-ocean');
        expect(style.backgroundImage).toContain(`url("${oceanItem.image}")`);
        // Gradient vẫn nằm dưới làm lớp dự phòng khi ảnh chưa tải/hỏng.
        expect(style.backgroundImage).toContain('linear-gradient(120deg,#0ea5e9');
        // Ảnh phải NẰM TRÊN gradient (layer đầu là trên cùng, sau lớp phủ tối).
        expect(style.backgroundImage.indexOf('url(')).toBeLessThan(
            style.backgroundImage.indexOf('linear-gradient(120deg,#0ea5e9'),
        );
    });

    test('nền chỉ có gradient (chưa upload ảnh) vẫn chạy, không sinh url rỗng', () => {
        registerBackgroundCosmetics([
            { itemId: 'bg-neon', name: 'Nền Neon', effect: { slot: 'background', key: 'bg-neon' } },
        ]);
        expect(bgStyle('bg-neon').backgroundImage).not.toContain('url(');
    });

    test('effect.key khác itemId → đăng ký cả hai, trang bị theo itemId vẫn ra nền', () => {
        // Chỗ tra cứu dùng equipped.background = itemId, còn dữ liệu vào theo
        // effect.key. bg-vip-week có key 'vip-royal' — chỉ đăng ký theo key thì
        // trang bị xong không ra nền nào.
        registerBackgroundCosmetics([{
            itemId: 'bg-sunset',
            name: 'Nền Hoàng hôn',
            image: '/uploads/background/sunset.png',
            effect: { slot: 'background', key: 'sunset-key', styleMode: 'image' },
        }]);

        expect(bgStyle('bg-sunset').backgroundImage).toContain('url("/uploads/background/sunset.png")');
        expect(bgStyle('sunset-key').backgroundImage).toContain('url("/uploads/background/sunset.png")');
    });

    test('bỏ qua item không phải nền', () => {
        const before = Object.keys(BACKGROUNDS).length;
        registerBackgroundCosmetics([
            { itemId: 'frame-gold', effect: { slot: 'frame', key: 'frame-gold' } },
            { itemId: 'hint', effect: { type: 'resource' } },
        ]);
        expect(Object.keys(BACKGROUNDS)).toHaveLength(before);
    });
});

describe('báo React vẽ lại sau khi nạp catalog', () => {
    test('nạp được nền mới → bắn tín hiệu; không có gì để nạp → im lặng', () => {
        const spy = vi.fn();
        const unsub = subscribeCosmetics(spy);

        registerBackgroundCosmetics([]);                       // rỗng
        registerBackgroundCosmetics([{ itemId: 'x', effect: {} }]); // không phải nền
        expect(spy).not.toHaveBeenCalled();

        const before = cosmeticsVersion();
        registerBackgroundCosmetics([oceanItem]);
        expect(spy).toHaveBeenCalled();
        expect(cosmeticsVersion()).toBeGreaterThan(before);

        unsub();
    });
});

describe('bgKeyForUser', () => {
    test('nền yêu cầu VIP mà hết VIP → về mặc định', () => {
        expect(bgKeyForUser({ background: 'bg-vip-week', isVip: false })).toBeNull();
        expect(bgKeyForUser({ background: 'bg-vip-week', isVip: true })).toBe('bg-vip-week');
    });

    test('không trang bị gì và không VIP → null', () => {
        expect(bgKeyForUser({})).toBeNull();
    });
});
