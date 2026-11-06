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
        testNgay: { type: Date, default: null },
        chanDoan: { type: [mongoose.Schema.Types.Mixed], default: [] },
        lichSuTest: { type: [{ ngay: Date, diem: Number, theoKyNang: mongoose.Schema.Types.Mixed, _id: false }], default: [] },
    },
    { timestamps: true, collection: 'ho_so_hoc_vien', minimize: false },
);

module.exports = mongoose.model('HoSoHocVien', hoSoHocVienSchema);
