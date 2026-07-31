/**
 * Unit test — cộng XP phải áp lên cấp NGAY (applyLevelUp / awardXp). Pure, no DB.
 *
 * Chốt lại bất biến: sau khi cộng XP, `profile.level` luôn khớp `stats.xp`
 * (xp còn lại < ngưỡng của level hiện tại). Đây là gốc rễ bug feature-unlock:
 * xưa có nguồn thưởng cộng xp mà quên áp lên cấp → level kẹt → user bị khoá oan.
 */
const { applyLevelUp, awardXp, XP_FORMULA } = require('../utils/userStateHelper');

const baseProfile = () => ({ level: 1, currentLevelXp: 0 });
const baseStats = () => ({ xp: 0, totalXp: 0, coins: 0 });

describe('applyLevelUp', () => {
    test('không đủ xp thì không lên cấp', () => {
        const p = baseProfile(); const s = { ...baseStats(), xp: 50 };
        const r = applyLevelUp(p, s);
        expect(r.leveledUp).toBe(false);
        expect(p.level).toBe(1);
        expect(s.xp).toBe(50);
    });

    test('đủ xp thì lên cấp và trừ đúng ngưỡng', () => {
        const p = baseProfile(); const s = { ...baseStats(), xp: XP_FORMULA(1) + 10 };
        const r = applyLevelUp(p, s);
        expect(r.leveledUp).toBe(true);
        expect(p.level).toBe(2);
        expect(s.xp).toBe(10);
        expect(r.coinsReward).toBe(100);
    });

    test('xp dồn nhiều cấp thì lên nhiều lần trong 1 lần gọi', () => {
        // Đây chính là ca bug: xp=1223 ở level 3 phải nhảy lên level 4.
        const p = { level: 3, currentLevelXp: 0 };
        const s = { ...baseStats(), xp: 1223 };
        const r = applyLevelUp(p, s);
        expect(r.leveledUp).toBe(true);
        expect(p.level).toBe(4);            // 1223 >= XP(3)=519 → L4; 704 < XP(4)=800 → dừng
        expect(s.xp).toBe(1223 - XP_FORMULA(3));
        expect(s.xp).toBeLessThan(XP_FORMULA(4)); // bất biến: xp còn lại < ngưỡng
    });

    test('idempotent — gọi lần 2 không đổi gì nữa', () => {
        const p = { level: 3, currentLevelXp: 0 };
        const s = { ...baseStats(), xp: 1223 };
        applyLevelUp(p, s);
        const r2 = applyLevelUp(p, s);
        expect(r2.leveledUp).toBe(false);
        expect(p.level).toBe(4);
    });
});

describe('awardXp', () => {
    test('cộng xp + totalXp và áp lên cấp trong cùng một bước', () => {
        const p = baseProfile(); const s = baseStats();
        const r = awardXp(p, s, XP_FORMULA(1) + 5); // đủ lên L2
        expect(r.xp).toBe(XP_FORMULA(1) + 5);
        expect(s.totalXp).toBe(XP_FORMULA(1) + 5);
        expect(p.level).toBe(2);
        expect(s.xp).toBe(5);
        expect(s.coins).toBe(100); // thưởng lên cấp cộng vào coins
    });

    test('amount rỗng/không hợp lệ là no-op', () => {
        const p = baseProfile(); const s = baseStats();
        expect(awardXp(p, s, 0).leveledUp).toBe(false);
        expect(awardXp(p, s, undefined).xp).toBe(0);
        expect(awardXp(p, s, -50).xp).toBe(0);
        expect(s.xp).toBe(0);
        expect(p.level).toBe(1);
    });

    test('làm tròn xuống phần lẻ', () => {
        const p = baseProfile(); const s = baseStats();
        awardXp(p, s, 30.9);
        expect(s.xp).toBe(30);
    });
});
