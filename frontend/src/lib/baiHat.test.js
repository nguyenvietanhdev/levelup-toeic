/**
 * Hàm thuần của Học qua bài hát.
 *
 * Chỗ dễ hỏng: màu chạy qua chữ lệch hẳn nhịp (chia đều theo ký tự, kéo dài hết đoạn dạo nhạc
 * giữa hai dòng), mất dấu câu khi tách chữ, tiếng Trung không tách được chữ; ô trống đổi chỗ mỗi
 * lần vẽ lại; điền "dont" cho "don't" bị chấm sai.
 */
import { describe, test, expect } from 'vitest';
import { soAmTiet, tachMau, mauCoGio, tienDo, chonOTrong, khopTu, GIAY_MOI_AM } from './baiHat.js';

describe('âm tiết', () => {
    test.each([['be', 1], ['trouble', 2], ['wisdom', 2], ['whisper', 2], ['time', 1], ['beautiful', 3], ['', 0]])('%s → %i', (tu, n) => {
        expect(soAmTiet(tu)).toBe(n);
    });
});

describe('tách chữ', () => {
    test('tiếng Anh: giữ nguyên dấu câu và khoảng trắng khi ghép lại', () => {
        const m = tachMau("Oh, don't go!");
        expect(m.map((x) => x.hien).join('')).toBe("Oh, don't go!");
        expect(m.filter((x) => x.tu).map((x) => x.tu)).toEqual(['Oh', "don't", 'go']);
    });
    test('tiếng Trung: mỗi chữ Hán một mẩu, dấu câu không tính âm', () => {
        const m = tachMau('你好，世界', 'zh');
        expect(m.map((x) => x.tu)).toEqual(['你', '好', '', '世', '界']);
        expect(m.map((x) => x.nang)).toEqual([1, 1, 0, 1, 1]);
    });
});

describe('thời điểm từng chữ', () => {
    test('chia theo âm tiết, bắt đầu ở mốc dòng, chữ sau nối chữ trước', () => {
        const m = mauCoGio({ batDau: 10, ketThuc: 20, text: 'Let it be' }).filter((x) => x.tu);
        expect(m[0].batDau).toBe(10);
        expect(m[1].batDau).toBeCloseTo(m[0].ketThuc, 5);
        expect(m[2].batDau).toBeCloseTo(m[1].ketThuc, 5);
    });

    test('dòng ngắn trước đoạn dạo nhạc dài: không kéo chữ hết khoảng lặng', () => {
        const m = mauCoGio({ batDau: 0, ketThuc: 30, text: 'Let it be' }).filter((x) => x.tu);
        expect(m[2].ketThuc).toBeCloseTo(3 * GIAY_MOI_AM + 0.3, 5);
    });

    test('dòng hát dồn: không vượt quá mốc dòng sau', () => {
        const m = mauCoGio({ batDau: 0, ketThuc: 1, text: 'When I find myself in times of trouble' }).filter((x) => x.tu);
        expect(m[m.length - 1].ketThuc).toBeCloseTo(1, 5);
    });

    test('có mốc từng chữ thì dùng đúng mốc đó', () => {
        const m = mauCoGio({ batDau: 10, ketThuc: 14, text: 'Let it be', tu: [{ batDau: 10, text: 'Let ' }, { batDau: 11, text: 'it ' }, { batDau: 13, text: 'be' }] });
        expect(m.map((x) => [x.tu, x.batDau, x.ketThuc])).toEqual([['Let', 10, 11], ['it', 11, 13], ['be', 13, 14]]);
    });

    test('tiến độ tô 0..1', () => {
        const mau = { batDau: 10, ketThuc: 12 };
        expect(tienDo(mau, 9)).toBe(0);
        expect(tienDo(mau, 11)).toBe(0.5);
        expect(tienDo(mau, 13)).toBe(1);
        expect(tienDo({ batDau: null }, 5)).toBe(0);
    });
});

describe('ô trống', () => {
    const cau = [{ text: 'When I find myself in times of trouble' }, { text: 'Let it be' }, { text: 'Oh' }];
    test('cùng hạt giống thì cùng ô trống; mức Vừa 2 ô mỗi dòng (nếu đủ chữ)', () => {
        const a = chonOTrong(cau, 'en', 'vua', 7);
        expect(chonOTrong(cau, 'en', 'vua', 7)).toEqual(a);
        expect(a[0]).toHaveLength(2);
        expect(a[2]).toEqual([]); // "Oh" quá ngắn
    });
    test('mức Dễ: một ô, là chữ dài dễ nghe, không phải chữ ngắn thông dụng', () => {
        const [d] = chonOTrong(cau, 'en', 'de', 3);
        const mau = tachMau(cau[0].text);
        expect(d).toHaveLength(1);
        expect(mau[d[0]].tu.length).toBeGreaterThanOrEqual(5);
    });
    test('tiếng Trung đục từng chữ Hán', () => {
        const [d] = chonOTrong([{ text: '月亮代表我的心' }], 'zh', 'vua', 1);
        expect(d).toHaveLength(2);
        d.forEach((k) => expect(tachMau('月亮代表我的心', 'zh')[k].tu).toMatch(/[一-鿿]/));
    });
    test('so đáp án: bỏ qua hoa thường, dấu nháy, dấu câu', () => {
        expect(khopTu('DONT', "don't")).toBe(true);
        expect(khopTu('don’t', "don't")).toBe(true);
        expect(khopTu('trouble.', 'trouble')).toBe(true);
        expect(khopTu('troubles', 'trouble')).toBe(false);
        expect(khopTu('', 'x')).toBe(false);
    });
});
