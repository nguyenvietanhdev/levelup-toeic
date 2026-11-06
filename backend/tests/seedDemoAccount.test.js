/**
 * Số liệu mẫu của tài khoản demo.
 *
 * Chỗ dễ hỏng, đều im lặng: dữ liệu mẫu lệch khỏi hồ sơ thật thì màn hồ sơ của tài khoản
 * demo, thứ nhà tuyển dụng thấy đầu tiên, sẽ hỏng hoặc hiện trống.
 */
jest.mock('../models/HoSoHocVien', () => ({}));
const { duLieuDemo } = require('../scripts/seedDemoAccount');
const { KY_NANG, tomTatKyNang, tongQuanTrinhDo } = require('../services/hoSoHoc');

const NOW = new Date('2026-11-06T05:00:00Z');

describe('dữ liệu demo', () => {
    const d = duLieuDemo(NOW);

    test('đủ mọi kỹ năng của hồ sơ, tính được trình độ', () => {
        expect(Object.keys(d.hoSo.kyNang).sort()).toEqual(KY_NANG.map((k) => k.key).sort());
        const t = tomTatKyNang(d.hoSo.kyNang);
        expect(t.every((k) => k.duDuLieu)).toBe(true);
        expect(tongQuanTrinhDo(t).diem).toBeGreaterThan(0);
    });
    test('chẩn đoán đủ trường để hiển thị, đúng kỹ năng có thật', () => {
        const khoa = new Set(KY_NANG.map((k) => k.key));
        for (const c of d.hoSo.chanDoan) {
            expect(khoa.has(c.kyNang)).toBe(true);
            expect(c.ten && c.nhan && c.viec && c.ma).toBeTruthy();
        }
    });
    test('streak còn hiệu lực: lượt chơi cuối là hôm qua', () => {
        expect(NOW.getTime() - d.stats.streakLastPlayDate.getTime()).toBe(24 * 60 * 60 * 1000);
    });
    test('không tự cấp quyền admin, không chứa mật khẩu', () => {
        expect(JSON.stringify(d)).not.toMatch(/admin|password/i);
    });
});
