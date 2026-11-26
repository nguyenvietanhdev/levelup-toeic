/**
 * Hàm thuần của Học qua bài hát.
 *
 * Chỗ dễ hỏng: màu chạy qua chữ lệch hẳn nhịp (chia đều theo ký tự, kéo dài hết đoạn dạo nhạc
 * giữa hai dòng), mất dấu câu khi tách chữ, tiếng Trung không tách được chữ; ô trống đổi chỗ mỗi
 * lần vẽ lại; điền "dont" cho "don't" bị chấm sai.
 */
import { describe, test, expect } from 'vitest';
import { tuCuaTungChu, soAmTiet, tachMau, mauCoGio, tienDo, chonOTrong, khopTu, GIAY_MOI_AM, tocDoBai, lechCua, apLech, chonDongKhop, datLechTu } from './baiHat.js';

describe('âm tiết', () => {
    test.each([['be', 1], ['one', 1], ['are', 1], ['the', 1], ['trouble', 2], ['wisdom', 2], ['whisper', 2], ['time', 1], ['beautiful', 3], ['', 0]])('%s → %i', (tu, n) => {
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

    test('dòng ngắn trước đoạn dạo nhạc dài: chữ cuối được ngân thêm vài âm tiết, không kéo hết khoảng lặng', () => {
        const m = mauCoGio({ batDau: 0, ketThuc: 30, text: 'Let it be' }).filter((x) => x.tu);
        expect(m[1].ketThuc).toBeCloseTo(2 * GIAY_MOI_AM, 5);
        expect(m[2].batDau).toBeCloseTo(2 * GIAY_MOI_AM, 5);
        expect(m[2].ketThuc).toBeCloseTo(3 * GIAY_MOI_AM + 3 * GIAY_MOI_AM, 5);
    });

    test('dòng vừa khít: chữ cuối ngân tới sát dòng sau', () => {
        const m = mauCoGio({ batDau: 0, ketThuc: 1.5, text: 'Let it be' }, 'en', 0.4).filter((x) => x.tu);
        expect(m[2].ketThuc).toBeCloseTo(1.5, 5);
    });

    test('sau dấu phẩy có một nhịp ngắt: chữ sau dấu phẩy bắt đầu muộn hơn chữ trước kết thúc', () => {
        const m = mauCoGio({ batDau: 0, ketThuc: 20, text: 'Oh yeah, let it be' }, 'en', 0.4).filter((x) => x.tu);
        expect(m[2].batDau - m[1].ketThuc).toBeCloseTo(0.2, 5);
        expect(m[1].batDau - m[0].ketThuc).toBeCloseTo(0, 5);
    });

    test('tốc độ riêng của bài: bài nhanh tô nhanh, bài chậm tô chậm', () => {
        const dong = (batDau, giayMoiAm) => ({ batDau, ketThuc: batDau + 6 * giayMoiAm, text: 'la la la la la la' });
        const nhanh = [0, 2, 4, 6].map((t) => dong(t, 0.2));
        const cham = [0, 5, 10, 15].map((t) => dong(t, 0.7));
        expect(tocDoBai(nhanh)).toBeCloseTo(0.2, 5);
        expect(tocDoBai(cham)).toBeCloseTo(0.7, 5);
        // Ít dòng quá thì dùng tốc độ mặc định; kẹp trong khoảng hợp lý.
        expect(tocDoBai(nhanh.slice(0, 2))).toBe(GIAY_MOI_AM);
        expect(tocDoBai([0, 1, 2, 3].map((t) => ({ batDau: t, ketThuc: t + 0.1, text: 'one two three four' })))).toBe(0.15);
    });

    test('đoạn dạo nhạc chen giữa vài dòng không làm chậm cả bài (lấy mức thấp, không lấy trung bình)', () => {
        const ds = [0, 3, 6, 9, 12].map((t) => ({ batDau: t, ketThuc: t + 1.2, text: 'la la la' }));
        ds.push({ batDau: 20, ketThuc: 60, text: 'la la la' });
        expect(tocDoBai(ds)).toBeCloseTo(0.4, 5);
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

describe('độ lệch từng đoạn (Khớp dòng này)', () => {
    const cau = [0, 10, 20, 30].map((t) => ({ batDau: t, ketThuc: t + 10, text: `dòng ${t}` }));

    test('độ lệch của một dòng: mốc gần nhất phía trước, không có thì độ lệch chung', () => {
        const lechTu = [{ dong: 2, lech: 3 }];
        expect(lechCua(0, 1, lechTu)).toBe(1);
        expect(lechCua(2, 1, lechTu)).toBe(3);
        expect(lechCua(3, 1, lechTu)).toBe(3);
    });

    test('áp lệch: dòng dời theo đoạn của nó, không dòng nào kéo dài đè lên dòng sau', () => {
        const h = apLech(cau, 0, [{ dong: 2, lech: -4 }]);
        expect(h.map((c) => c.batDau)).toEqual([0, 10, 16, 26]);
        expect(h[1].ketThuc).toBe(16); // vốn 20, cắt ở mốc dòng 2 mới
        expect(h[3].ketThuc).toBe(36);
    });

    test('áp lệch dời cả mốc từng chữ', () => {
        const [c] = apLech([{ batDau: 5, ketThuc: 8, text: 'a b', tu: [{ batDau: 5, text: 'a ' }, { batDau: 6, text: 'b' }] }], 2, []);
        expect(c.tu.map((x) => x.batDau)).toEqual([7, 8]);
    });

    test('bấm khớp: chọn dòng đang hiện hay dòng kế, cái nào có mốc gần lúc bấm hơn', () => {
        // Lời đang muộn: dòng 1 chưa hiện (vẫn ở dòng 0) mà người học nghe thấy dòng 1 bắt đầu ở 8s.
        expect(chonDongKhop(cau, 8, 0)).toBe(1);
        // Lời đang sớm: dòng 1 đã hiện từ 10s, người học nghe thấy nó bắt đầu thật ở 12s.
        expect(chonDongKhop(cau, 12, 1)).toBe(1);
        expect(chonDongKhop(cau, 1, -1)).toBe(0);
    });

    test('đặt mốc: thay mốc cũ cùng dòng, giữ thứ tự', () => {
        expect(datLechTu([{ dong: 3, lech: 1 }, { dong: 1, lech: 2 }], 3, 2.456)).toEqual([{ dong: 1, lech: 2 }, { dong: 3, lech: 2.46 }]);
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

describe('tiếng Trung: tách từ, pinyin', () => {
    test('mỗi chữ biết nó thuộc từ nào (để tra cả từ); dấu câu không thuộc từ nào', () => {
        expect(tuCuaTungChu('我的好朋友在银行工作。')).toEqual(['我的', '我的', '好朋友', '好朋友', '好朋友', '在', '银行', '银行', '工作', '工作', '']);
        const m = tachMau('银行。', 'zh');
        expect(m.map((x) => x.tuTra)).toEqual(['银行', '银行', undefined]);
    });
    test('pinyin từng ký tự, đọc theo ngữ cảnh; ký tự không phải chữ Hán thì rỗng', async () => {
        const { napPinyin, pinyinTheoChu, pinyinCuaTu } = await import('./pinyinBaiHat.js');
        const f = await napPinyin();
        expect(pinyinTheoChu(f, '银行，不行')).toEqual(['yín', 'háng', '', 'bù', 'xíng']);
        expect(pinyinTheoChu(f, 'OK吗')).toEqual(['', '', 'ma']);
        expect(pinyinCuaTu(f, '银行')).toBe('yín háng');
    });
    test('thư viện trả lệch độ dài thì không gắn pinyin sai chữ', async () => {
        const { pinyinTheoChu } = await import('./pinyinBaiHat.js');
        expect(pinyinTheoChu(() => [{ isZh: true, pinyin: 'x' }], '你好')).toEqual(['', '']);
    });
});

describe('lời tiếng Nhật / Hàn', () => {
    test('tiếng Nhật: mỗi chữ (kanji, kana) một mẩu, như tiếng Trung', () => {
        const m = tachMau('君の名は', 'ja');
        expect(m.map((x) => x.tu)).toEqual(['君', 'の', '名', 'は']);
        expect(m.every((x) => x.nang === 1)).toBe(true);
    });
    test('tiếng Hàn: theo từ (khoảng trắng), mỗi khối Hangul một âm tiết', () => {
        const m = tachMau('사랑해 너를', 'ko').filter((x) => x.tu);
        expect(m.map((x) => x.tu)).toEqual(['사랑해', '너를']);
        expect(m.map((x) => x.nang)).toEqual([3, 2]);
    });
});
