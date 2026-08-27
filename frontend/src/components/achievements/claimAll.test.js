/**
 * "Nhận tất cả" — hai lỗi người dùng báo, cùng một nguyên nhân.
 *
 *   1. "bấm xong là biến mất các số luôn" — giao diện đổi TRƯỚC khi server trả
 *      lời, nên số nhảy về 0 tức thì dù chưa có gì được lưu.
 *   2. "tự giảm số dần dần, lag rất chậm" — 30 request TUẦN TỰ. Đo thật:
 *      273ms mỗi request × 30 = 8,2 giây.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scr = readFileSync(join(__dirname, 'AchievementsScreen.jsx'), 'utf8');
const api = readFileSync(join(__dirname, '..', '..', 'api', 'achievements.js'), 'utf8');

/** Thân `handleClaimAll`. */
const than = () => {
    const i = scr.indexOf('async function handleClaimAll');
    expect(i).toBeGreaterThan(-1);
    return scr.slice(i, scr.indexOf('\n    }', i));
};

describe('một request cho cả mẻ, không lặp 30 lần', () => {
    test('gọi `claimAll`, KHÔNG lặp `claim` từng cái', () => {
        const t = than();
        expect(t).toMatch(/AchievementsAPI\.claimAll\(/);
        // Vòng `for … await claim()` là thứ gây 8,2 giây.
        expect(t).not.toMatch(/for \(const a of toClaim\)/);
        expect(t).not.toMatch(/await AchievementsAPI\.claim\(/);
    });

    test('API client có `claimAll`', () => {
        expect(api).toMatch(/async claimAll\(/);
        expect(api).toMatch(/achievements\/claim-all/);
    });

    test('gửi kèm danh sách mã cần nhận', () => {
        expect(than()).toMatch(/claimAll\(toClaim\.map/);
    });
});

describe('không đổi giao diện trước khi server trả lời', () => {
    test('`markUnlocked` gọi SAU khi có kết quả', () => {
        // Đây chính là "bấm xong là biến mất các số luôn".
        const t = than();
        const iGoi = t.indexOf('await AchievementsAPI.claimAll');
        const iDanhDau = t.indexOf('markUnlocked(nhanDuoc, true)');
        expect(iGoi).toBeGreaterThan(-1);
        expect(iDanhDau).toBeGreaterThan(iGoi);
    });

    test('cộng thưởng SAU khi có kết quả', () => {
        const t = than();
        const iGoi = t.indexOf('await AchievementsAPI.claimAll');
        expect(t.indexOf('creditServerRewards')).toBeGreaterThan(iGoi);
    });

    test('server hỏng thì KHÔNG đổi gì cả', () => {
        const t = than();
        expect(t).toMatch(/if \(!kq\?\.success\)/);
        expect(t).toMatch(/chưa có gì thay đổi/);
    });

    test('chỉ đánh dấu cái server THỰC SỰ phát thưởng', () => {
        // Server bỏ qua cái chưa đủ điều kiện; đánh dấu hết là nói dối.
        expect(than()).toMatch(/kq\.data\?\.claimed \|\| \[\]/);
    });

    test('tổng thưởng lấy từ SERVER, không tự cộng ở client', () => {
        // Hai bên tính lệch thì số trên màn hình khác số thật trong DB.
        const t = than();
        expect(t).toMatch(/creditServerRewards\(kq\.data\?\.rewards/);
        expect(t).not.toMatch(/const rewardOf/);
    });

    test('mở khoá nút lại ở MỌI đường thoát', () => {
        // Thoát sớm mà quên thì nút kẹt "đang xử lý" vĩnh viễn.
        const t = than();
        const soLanTat = (t.match(/setClaimingAll\(false\)/g) || []).length;
        const soLanReturn = (t.match(/\n            return;/g) || []).length;
        expect(soLanTat).toBeGreaterThanOrEqual(soLanReturn);
    });
});
