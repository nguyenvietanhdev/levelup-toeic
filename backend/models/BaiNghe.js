const mongoose = require('mongoose');

/**
 * Bài nghe có script chạy theo (nguồn chính: VOA Learning English — phạm vi công cộng).
 *
 * File (âm thanh hoặc video) lưu trên Cloudinary, không trỏ thẳng về máy chủ gốc: trang VOA bị
 * chặn ở Việt Nam, người học bấm phát sẽ không tải được. `coHinh` = video có hình. `cau` là
 * script đã chia câu, mỗi câu có mốc thời gian (giây) lấy từ chính file đó nên luôn khớp.
 */
const cauSchema = new mongoose.Schema(
    {
        batDau: { type: Number, required: true },
        ketThuc: { type: Number, required: true },
        text: { type: String, required: true, maxlength: 600 },
    },
    { _id: false },
);

const baiNgheSchema = new mongoose.Schema(
    {
        tieuDe: { type: String, required: true, maxlength: 160 },
        lang: { type: String, enum: ['en', 'zh'], default: 'en' },
        capDo: { type: String, enum: ['de', 'vua', 'kho'], default: 'vua' },
        // Ghi công nguồn: bắt buộc hiển thị cùng bài (VOA yêu cầu ghi nguồn khi dùng lại).
        nguon: { type: String, default: 'VOA Learning English', maxlength: 120 },
        nguonUrl: { type: String, default: '', maxlength: 500 },
        mediaUrl: { type: String, required: true },
        coHinh: { type: Boolean, default: false },
        cloudinaryId: { type: String, default: '' },
        thoiLuong: { type: Number, default: 0 },
        cau: { type: [cauSchema], default: [] },
        // Ẩn thay vì xoá: xoá file trên Cloudinary là không lấy lại được.
        an: { type: Boolean, default: false },
        taoBoi: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'bai_nghe' },
);

baiNgheSchema.index({ an: 1, lang: 1, createdAt: -1 });

module.exports = mongoose.model('BaiNghe', baiNgheSchema);
