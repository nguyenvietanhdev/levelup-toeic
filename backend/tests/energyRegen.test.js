/**
 * Hồi năng lượng SERVER-SIDE kèm thẻ tăng tốc (x2/x3).
 *
 * Đây là đường tiền: hồi sai = phát ⚡ miễn phí hoặc ăn cắp ⚡ của người chơi.
 * Chốt kỹ ca thẻ hết hạn GIỮA quãng nghỉ — chỗ dễ tính lố nhất.
 */
const { applyEnergyRegen, energyRegenMultiplier } = require('../utils/userStateHelper');

// Mọi mốc thời gian trong MỘT test phải suy từ cùng một `base`.
// Trước đây helper gọi Date.now() riêng cho từng mốc, nên hạn thẻ và
// lastEnergyUpdate lệch nhau vài ms — đủ để Math.floor(số phút) tụt 1 và bài
// "thẻ hết hạn giữa quãng nghỉ" đỏ ngẫu nhiên (13 → 12).
let base = Date.now();
beforeEach(() => { base = Date.now(); });
const minutesAgo = (n) => new Date(base - n * 60000);

const stats = (over = {}) => ({
    energy: 0, maxEnergy: 60,
    lastEnergyUpdate: minutesAgo(10),
    energyBoostActive: false, energyBoostMultiplier: 1, energyBoostExpiresAt: null,
    ...over,
});

describe('energyRegenMultiplier', () => {
    test('không có thẻ → 1', () => {
        expect(energyRegenMultiplier(stats())).toBe(1);
    });

    test('thẻ còn hạn → đúng hệ số', () => {
        const s = stats({ energyBoostActive: true, energyBoostMultiplier: 3, energyBoostExpiresAt: minutesAgo(-30) });
        expect(energyRegenMultiplier(s)).toBe(3);
    });

    test('thẻ đã hết hạn → 1 (không ăn theo cờ active cũ)', () => {
        const s = stats({ energyBoostActive: true, energyBoostMultiplier: 3, energyBoostExpiresAt: minutesAgo(5) });
        expect(energyRegenMultiplier(s)).toBe(1);
    });
});

describe('applyEnergyRegen', () => {
    test('không thẻ: 1⚡/phút', () => {
        const s = stats();
        applyEnergyRegen(s);
        expect(s.energy).toBe(10);
    });

    test('thẻ x2 phủ hết quãng nghỉ → gấp đôi', () => {
        const s = stats({ energyBoostActive: true, energyBoostMultiplier: 2, energyBoostExpiresAt: minutesAgo(-60) });
        applyEnergyRegen(s);
        expect(s.energy).toBe(20);
    });

    test('thẻ hết hạn GIỮA quãng nghỉ → chỉ nhân phần còn hạn', () => {
        // Nghỉ 10 phút, thẻ x2 chỉ còn hiệu lực 3 phút đầu → 3*2 + 7 = 13.
        const s = stats({
            energyBoostActive: true, energyBoostMultiplier: 2,
            energyBoostExpiresAt: minutesAgo(7),
        });
        applyEnergyRegen(s);
        expect(s.energy).toBe(13);
    });

    test('không vượt trần maxEnergy dù thẻ x3', () => {
        const s = stats({
            energy: 50, maxEnergy: 60, lastEnergyUpdate: minutesAgo(60),
            energyBoostActive: true, energyBoostMultiplier: 3, energyBoostExpiresAt: minutesAgo(-60),
        });
        applyEnergyRegen(s);
        expect(s.energy).toBe(60);
    });

    test('thẻ hết hạn → tự tắt cờ, khỏi hiện boost đã chết trên giao diện', () => {
        const s = stats({ energyBoostActive: true, energyBoostMultiplier: 2, energyBoostExpiresAt: minutesAgo(1) });
        applyEnergyRegen(s);
        expect(s.energyBoostActive).toBe(false);
        expect(s.energyBoostMultiplier).toBe(1);
    });

    test('đang đầy thì không cộng thêm và không đụng mốc thời gian', () => {
        const last = minutesAgo(30);
        const s = stats({ energy: 60, maxEnergy: 60, lastEnergyUpdate: last });
        applyEnergyRegen(s);
        expect(s.energy).toBe(60);
        expect(s.lastEnergyUpdate).toBe(last);
    });
});
