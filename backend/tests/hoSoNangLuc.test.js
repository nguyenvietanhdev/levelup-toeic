/**
 * Hồ sơ năng lực: gộp các nguồn và rút điểm mạnh, điểm cần cải thiện.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Kết luận khi chưa đủ dữ liệu.
 *   2. Một kỹ năng vừa nằm ở "mạnh" vừa ở "cần cải thiện".
 *   3. Thiếu một nguồn (chưa làm TOEIC, chưa luyện gì) làm cả trang hỏng.
 *   4. Mất `key` nên giao diện không mở được đúng chỗ luyện.
 */
jest.mock('../models/HoSoHocVien', () => ({}));
jest.mock('../models/UserProfile', () => ({}));
jest.mock('../models/UserStats', () => ({}));
jest.mock('../models/PhanXaTienDo', () => ({}));
jest.mock('../models/NguPhapTienDo', () => ({}));
jest.mock('../models/ToeicAttempt', () => ({}));

const { tongHop, rutNhanXet } = require('../services/hoSoNangLuc');

const kn = (key, ten, diem, muc, duDuLieu = true) => ({ key, ten, diem, muc, duDuLieu });
const TOEIC = {
    soBai: 3,
    diemMucTieu: 750,
    duDoan: { enough: true, predicted: { low: 500, mid: 550, high: 600 } },
    trongTam: { part: 7, ten: 'Đọc hiểu' },
    parts: [
        { part: 5, ten: 'Điền vào câu', duDuLieu: true, doChinhXac: 80 },
        { part: 7, ten: 'Đọc hiểu', duDuLieu: true, doChinhXac: 50 },
        { part: 1, ten: 'Mô tả tranh', duDuLieu: false, doChinhXac: null },
    ],
};

describe('điểm mạnh và cần cải thiện', () => {
    test('rút từ kỹ năng con, xu hướng, lỗi lặp và TOEIC, mỗi điều có chỗ để luyện', () => {
        const r = rutNhanXet({
            kyNangCon: [kn('mau-giao-tiep', 'Mẫu câu', 82, 'vung'), kn('qua-khu', 'Quá khứ', 30, 'yeu')],
            kyNang: [{ key: 'nghe', ten: 'Nghe', xuHuong: 'len' }, { key: 'viet', ten: 'Viết', xuHuong: 'xuong' }],
            diemYeuTienBo: [{ loai: 'ngu-phap', key: 'article', vi: 'Mạo từ' }],
            toeic: TOEIC,
        });
        expect(r.diemManh.map((x) => x.key)).toEqual(['mau-giao-tiep', 'nghe', 5]);
        expect(r.canCaiThien.map((x) => x.key)).toEqual(['qua-khu', 'viet', 'article', 7]);
        for (const x of [...r.diemManh, ...r.canCaiThien]) expect(x.loai && x.chu).toBeTruthy();
    });
    test('chưa đủ dữ liệu hoặc đang đi ngang: không kết luận', () => {
        const r = rutNhanXet({
            kyNangCon: [kn('noi', 'Nói', 30, 'chua-du', false), kn('nghe', 'Nghe', 60, 'dang-len')],
            kyNang: [{ key: 'doc', ten: 'Đọc', xuHuong: 'ngang' }, { key: 'noi', ten: 'Nói', xuHuong: null }],
        });
        expect(r).toEqual({ diemManh: [], canCaiThien: [] });
    });
    test('Part trọng tâm chưa đo (chỉ là gợi ý khảo sát) thì không gọi là điểm yếu', () => {
        const r = rutNhanXet({ toeic: { ...TOEIC, trongTam: { part: 1, ten: 'Mô tả tranh' } } });
        expect(r.canCaiThien).toEqual([]);
    });
    test('cùng một thứ vừa mạnh vừa yếu: bỏ cả hai, không nói điều mâu thuẫn', () => {
        const r = rutNhanXet({
            toeic: { ...TOEIC, trongTam: { part: 5, ten: 'Điền vào câu' } },
        });
        expect(r.diemManh.map((x) => x.key)).not.toContain(5);
        expect(r.canCaiThien.map((x) => x.key)).not.toContain(5);
    });
    test('tối đa 4 điều mỗi bên', () => {
        const nhieu = Array.from({ length: 7 }, (_, i) => kn(`k${i}`, `K${i}`, 20, 'yeu'));
        expect(rutNhanXet({ kyNangCon: nhieu }).canCaiThien).toHaveLength(4);
    });
});

describe('gộp nguồn', () => {
    test('người mới chưa có gì: vẫn ra trang, báo chưa có dữ liệu', () => {
        const r = tongHop({ hoSo: null, tienBo: null, toeic: { soBai: 0 } });
        expect(r.coDuLieu).toBe(false);
        expect(r.toeic).toBeNull();
        expect(r.tongQuan.trinhDo.nhan).toBe('Chưa đủ dữ liệu');
        expect(r.thanhTich.phanXaTong).toBeGreaterThan(0);
        expect(r.thanhTich.nguPhapTong).toBeGreaterThan(0);
    });
    test('đủ nguồn: lấy đúng số từ từng nơi, không tính lại', () => {
        const r = tongHop({
            hoSo: { mucTieu: 'toeic', trinhDo: { diem: 60, nhan: 'Cơ bản' }, kyNang: [kn('qua-khu', 'Quá khứ', 30, 'yeu')] },
            tienBo: { kyNang: [{ key: 'nghe', ten: 'Nghe', ganDay: 70, soLuot: 4, xuHuong: 'len' }], tuVung: { daThuoc: 120, dangOn: 30 }, diemYeu: [] },
            toeic: TOEIC,
            phanXaDaThuoc: 9,
            nguPhap: { daLuyen: 5, daThuoc: 2 },
            taiKhoan: { level: 10, streak: 4 },
        });
        expect(r.tongQuan).toEqual({ mucTieu: 'toeic', trinhDo: { diem: 60, nhan: 'Cơ bản' }, level: 10, streak: 4 });
        expect(r.thanhTich).toMatchObject({ tuDaThuoc: 120, tuDangOn: 30, nguPhapDaThuoc: 2, nguPhapDaLuyen: 5, phanXaDaThuoc: 9 });
        expect(r.toeic.duDoan.predicted.mid).toBe(550);
        expect(r.coDuLieu).toBe(true);
    });
});
