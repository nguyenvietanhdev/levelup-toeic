/**
 * Chuyển từ Dịch nhanh sang Part theo ngày.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Tính ngày theo UTC → từ lưu lúc 6h sáng giờ Việt Nam rơi vào hôm trước.
 *   2. Đuôi ngôn ngữ sai → tiếng Anh và tiếng Trung lẫn vào nhau.
 *   3. Bắt nhầm Part người dùng tự đặt tên.
 */
jest.mock('../models/UserUpload', () => ({}));
const { partMoi, PART_CU } = require('../scripts/dichNhanhSangPartNgay');

describe('partMoi', () => {
    test('ngày theo giờ Việt Nam, đúng định dạng', () => {
        expect(partMoi({ createdAt: '2026-10-24T23:30:00Z', lang: 'en' })).toBe('25-10-2026-EN');
        expect(partMoi({ createdAt: '2026-01-05T02:00:00Z', lang: 'en' })).toBe('05-01-2026-EN');
    });
    test('đuôi theo `lang`; không có `lang` thì nhìn mặt chữ', () => {
        const createdAt = '2026-10-25T02:00:00Z';
        expect(partMoi({ createdAt, lang: 'zh', en: 'ni hao' })).toBe('25-10-2026-ZH');
        expect(partMoi({ createdAt, en: '你好' })).toBe('25-10-2026-ZH');
        expect(partMoi({ createdAt, en: 'hello' })).toBe('25-10-2026-EN');
    });
});

describe('PART_CU', () => {
    test('chỉ bắt Part do Dịch nhanh đặt', () => {
        for (const p of ['DICH-NHANH', 'DICH-NHANH-EN', 'DICH-NHANH-ZH']) expect(PART_CU.test(p)).toBe(true);
        for (const p of ['DICH-NHANH-2', 'TU-DICH-NHANH', 'PART 1', '25-10-2026-EN']) expect(PART_CU.test(p)).toBe(false);
    });
});
