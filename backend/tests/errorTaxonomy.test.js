/**
 * Phân loại lỗi ngữ pháp để thống kê được.
 *
 * Test GỌI HÀM THẬT. Chỗ dễ hỏng nhất ở đây là chuẩn hoá nhãn: AI trả
 * `"Article"`, `"articles"`, `"ARTICLE"` cho cùng một nhóm, và mỗi biến thể
 * lọt qua là một dòng thừa trong thống kê — hỏng ÂM THẦM, con số vẫn hiện ra
 * bình thường, chỉ là sai.
 */
const {
    LOAI_LOI, chuanHoaLoai, nhanLoi, goiYLoi, chiThiPhanLoai, thongKe,
} = require('../services/errorTaxonomy');

describe('chuẩn hoá nhãn AI trả về', () => {
    test('nhận nhãn đúng chuẩn', () => {
        expect(chuanHoaLoai('article')).toBe('article');
        expect(chuanHoaLoai('word-order')).toBe('word-order');
    });

    test('gộp các biến thể hoa thường và số nhiều về MỘT nhóm', () => {
        // Ba chuỗi này là cùng một lỗi; tách ra thì thống kê thành ba dòng.
        for (const v of ['Article', 'ARTICLE', 'articles', ' Articles ']) {
            expect(chuanHoaLoai(v)).toBe('article');
        }
    });

    test('gạch dưới và khoảng trắng đều thành gạch ngang', () => {
        expect(chuanHoaLoai('word_order')).toBe('word-order');
        expect(chuanHoaLoai('word order')).toBe('word-order');
    });

    test('nhãn lạ về `other`, KHÔNG bị vứt đi', () => {
        // Vứt thì tổng trong thống kê nhỏ hơn số lỗi thật mà không ai biết.
        for (const v of ['bịa', '', null, undefined, 123, {}]) {
            expect(chuanHoaLoai(v)).toBe('other');
        }
    });

    test('`other` là một nhóm có thật trong danh sách', () => {
        expect(LOAI_LOI.some((l) => l.key === 'other')).toBe(true);
    });
});

describe('nhãn và gợi ý hiển thị', () => {
    test('mọi nhóm đều có nhãn tiếng Việt', () => {
        for (const l of LOAI_LOI) {
            expect(typeof l.vi).toBe('string');
            expect(l.vi.length).toBeGreaterThan(0);
        }
    });

    test('nhóm lạ vẫn ra nhãn, không trả undefined', () => {
        // `undefined` lọt lên giao diện thành chữ "undefined".
        expect(typeof nhanLoi('khong-ton-tai')).toBe('string');
        expect(nhanLoi('khong-ton-tai').length).toBeGreaterThan(0);
        expect(typeof goiYLoi('khong-ton-tai')).toBe('string');
    });

    test('mọi nhóm trừ `other` đều có gợi ý luyện tập', () => {
        // Biết mình sai nhiều mà không biết làm gì tiếp thì thống kê chỉ để ngắm.
        for (const l of LOAI_LOI.filter((x) => x.key !== 'other')) {
            expect(l.hint.length).toBeGreaterThan(0);
        }
    });

    test('khoá không trùng nhau', () => {
        const keys = LOAI_LOI.map((l) => l.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('chỉ thị gửi cho AI', () => {
    test('liệt kê ĐÚNG các khoá trong danh sách', () => {
        // Lệch nhau thì AI gán nhãn ta không nhận ra, và mọi lỗi rơi vào `other`.
        const chiThi = chiThiPhanLoai();
        for (const l of LOAI_LOI) {
            expect(chiThi).toContain(l.key);
        }
    });

    test('dặn dùng chữ thường và có lối thoát', () => {
        expect(chiThiPhanLoai()).toMatch(/lowercase/);
        expect(chiThiPhanLoai()).toMatch(/"other" if none fits/);
    });
});

describe('thống kê', () => {
    test('đếm theo nhóm, nhiều nhất trước', () => {
        const r = thongKe([
            { type: 'article' }, { type: 'article' }, { type: 'article' },
            { type: 'tense' }, { type: 'tense' },
            { type: 'spelling' },
        ]);
        expect(r[0]).toMatchObject({ key: 'article', count: 3 });
        expect(r[1]).toMatchObject({ key: 'tense', count: 2 });
        expect(r[2]).toMatchObject({ key: 'spelling', count: 1 });
    });

    test('gộp biến thể trước khi đếm', () => {
        const r = thongKe([{ type: 'Article' }, { type: 'articles' }, { type: 'article' }]);
        expect(r).toHaveLength(1);
        expect(r[0].count).toBe(3);
    });

    test('đọc được CẢ HAI tên trường của hai nguồn', () => {
        // Translation lưu `loai` (vì `type` là từ khoá Mongoose), Essay lưu
        // `type`. Đọc thiếu một bên là mất trắng thống kê của nguồn đó.
        const r = thongKe([{ loai: 'article' }, { type: 'article' }]);
        expect(r).toHaveLength(1);
        expect(r[0].count).toBe(2);
    });

    test('kèm nhãn tiếng Việt và gợi ý', () => {
        const r = thongKe([{ type: 'article' }]);
        expect(r[0].vi).toMatch(/Mạo từ/);
        expect(r[0].hint.length).toBeGreaterThan(0);
    });

    test('thứ tự ỔN ĐỊNH khi số lượng bằng nhau', () => {
        // Thứ tự nhảy lung tung giữa hai lần gọi trông như dữ liệu đang đổi
        // trong khi không có gì đổi.
        const items = [{ type: 'spelling' }, { type: 'article' }];
        expect(thongKe(items).map((x) => x.key)).toEqual(thongKe(items).map((x) => x.key));
        // Và theo đúng thứ tự khai báo: `article` đứng trước `spelling`.
        expect(thongKe(items)[0].key).toBe('article');
    });

    test('lỗi không có nhãn vẫn được đếm vào `other`', () => {
        const r = thongKe([{ issue: 'gì đó' }, {}]);
        expect(r[0]).toMatchObject({ key: 'other', count: 2 });
    });

    test('đầu vào hỏng không ném lỗi', () => {
        for (const v of [null, undefined, 'không phải mảng', 42]) {
            expect(() => thongKe(v)).not.toThrow();
            expect(thongKe(v)).toEqual([]);
        }
    });

    test('danh sách rỗng ra mảng rỗng, không phải nhóm 0', () => {
        // Hiện "Mạo từ: 0" cho người chưa viết bài nào là báo một chẩn đoán
        // không có căn cứ.
        expect(thongKe([])).toEqual([]);
    });
});

describe('chỉ thị phân loại thật sự có trong prompt chấm bài', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const tr = readFileSync(join(__dirname, '..', 'services', 'translationGrader.js'), 'utf8');
    const es = readFileSync(join(__dirname, '..', 'services', 'essayGrader.js'), 'utf8');

    test('bộ chấm DỊCH có gọi `chiThiPhanLoai()`', () => {
        // Thiếu nó thì AI không bao giờ gán nhãn, mọi lỗi rơi vào `other`, và
        // nhật ký chỉ hiện đúng một dòng "Khác" — hỏng hoàn toàn nhưng im lặng.
        expect(tr).toMatch(/chiThiPhanLoai\(\)/);
    });

    test('bộ chấm LUẬN có gọi, cho CẢ HAI ngôn ngữ', () => {
        // Hai prompt riêng (tiếng Anh và tiếng Trung); chèn một chỗ thì nguồn
        // kia im lặng không gán nhãn.
        expect(es.split('chiThiPhanLoai()').length - 1).toBe(2);
    });

    test('cả hai bộ chấm đều chuẩn hoá nhãn trước khi lưu', () => {
        expect(tr).toMatch(/chuanHoaLoai\(n\?\.type\)/);
        expect(es).toMatch(/chuanHoaLoai\(e\?\.type\)/);
    });
});
