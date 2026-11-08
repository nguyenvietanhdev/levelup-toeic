const mongoose = require('mongoose');

/**
 * Hồ sơ người học: mục tiêu và trình độ theo từng kỹ năng con.
 * `kyNang` = { <key>: { d, s, soLan, capNhat } } — d/s là số đúng/sai đã giảm dần theo
 * thời gian (xem `services/hoSoHoc.js`), để trình độ phản ánh hiện tại chứ không phải trung
 * bình cả quá khứ.
 */
const hoSoHocVienSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        mucTieu: { type: String, enum: ['giao-tiep', 'toeic', 'ielts', 'hsk', ''], default: '' },
        kyNang: { type: mongoose.Schema.Types.Mixed, default: {} },
        // Mức muốn đạt của từng mục tiêu: { ielts: 7, hsk: 4 }. Điểm TOEIC nằm ở cài đặt có sẵn.
        chiTiet: { type: mongoose.Schema.Types.Mixed, default: {} },
        testNgay: { type: Date, default: null },
        chanDoan: { type: [mongoose.Schema.Types.Mixed], default: [] },
        lichSuTest: { type: [{ ngay: Date, diem: Number, theoKyNang: mongoose.Schema.Types.Mixed, _id: false }], default: [] },
        // Test đầu vào tiếng Trung (mục tiêu HSK): lưu riêng để không đè test Giao tiếp tiếng Anh.
        testNgayZh: { type: Date, default: null },
        chanDoanZh: { type: [mongoose.Schema.Types.Mixed], default: [] },
        lichSuTestZh: { type: [{ ngay: Date, diem: Number, theoKyNang: mongoose.Schema.Types.Mixed, _id: false }], default: [] },
    },
    { timestamps: true, collection: 'ho_so_hoc_vien', minimize: false },
);

module.exports = mongoose.model('HoSoHocVien', hoSoHocVienSchema);
