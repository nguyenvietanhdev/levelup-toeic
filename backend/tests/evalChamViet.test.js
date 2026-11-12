/**
 * Các chỉ số của bộ đo chấm Viết (eval/chamViet) — phần tính toán, không gọi AI.
 *
 * Chỗ dễ hỏng: bộ đo báo "ổn" sai vì so khớp lỗi quá lỏng/quá chặt, hoặc độ lệch hiện cho người
 * học bị tính nhỏ hơn thực tế.
 */
const { daoDong, batDuoc, tiLeBatLoi, kiemThuTu, doLechHienThi } = require('../eval/chamViet/doLuong');
const { BAI, LOI_CAI, caiLoi } = require('../eval/chamViet/mau');

test('bài mẫu đủ dài cho Task 2 (≥ 250 từ); lỗi cài vào đúng chỗ', () => {
    for (const b of BAI) expect(b.bai.split(/\s+/).length).toBeGreaterThanOrEqual(250);
    const coLoi = BAI.find((b) => b.id === 'tot-cai-loi').bai;
    for (const l of LOI_CAI) expect(coLoi).toContain(l.sai);
    expect(() => caiLoi('abc', [{ goc: 'xyz', sai: 'q' }])).toThrow();
});

test('dao động: thấp, cao, chênh, trung bình; bỏ giá trị hỏng', () => {
    expect(daoDong([6, 6.5, 7, NaN])).toEqual({ lan: 3, tb: 6.5, thap: 6, cao: 7, chenh: 1 });
    expect(daoDong([])).toBeNull();
});

test('bắt lỗi: trích dẫn chứa cụm dấu hiệu, không phân biệt hoa thường; trích quá ngắn không tính', () => {
    const l = { dau: 'an informed decisions' };
    expect(batDuoc(l, [{ quote: 'make An informed  decisions' }])).toBe(true);
    expect(batDuoc(l, [{ quote: 'informed decisions' }])).toBe(true);
    expect(batDuoc(l, [{ quote: 'an' }])).toBe(false);
    expect(batDuoc(l, [{ quote: 'without sacrificing' }])).toBe(false);
    expect(tiLeBatLoi(LOI_CAI, [{ quote: 'it seem reasonable' }])).toMatchObject({ bat: 1, tong: 6 });
});

test('thứ tự: điểm phải tăng theo mức dự kiến', () => {
    const k = (id, mucDuKien, tb) => ({ id, mucDuKien, overall: { tb } });
    expect(kiemThuTu([k('yeu', 1, 4), k('vua', 2, 5.5), k('tot', 3, 7.5)]).dung).toBe(true);
    const sai = kiemThuTu([k('yeu', 1, 4), k('vua', 2, 7), k('tot', 3, 6.5)]);
    expect(sai.dung).toBe(false);
    expect(sai.sai[0]).toMatch(/vua \(7\) ≥ tot \(6.5\)/);
});

test('độ lệch hiện cho người học: nửa chênh lớn nhất, làm tròn LÊN 0.5, tối thiểu 0.5', () => {
    expect(doLechHienThi([{ overall: { chenh: 0 } }])).toBe(0.5);
    expect(doLechHienThi([{ overall: { chenh: 1 } }, { overall: { chenh: 0.5 } }])).toBe(0.5);
    expect(doLechHienThi([{ overall: { chenh: 1.5 } }])).toBe(1);
    expect(doLechHienThi([])).toBe(0.5);
});
