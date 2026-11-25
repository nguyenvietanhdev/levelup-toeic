const mongoose = require('mongoose');
const { MA_NGON_NGU } = require('../config/ngonNgu');

/**
 * Bài hát người học thêm để học qua lời. RIÊNG TƯ: mỗi bản ghi chỉ của một người, không có kho
 * dùng chung (lời bài hát có bản quyền, chỉ dùng để tự học).
 *
 * Nhạc phát bằng trình phát YouTube nhúng (`youtubeId`), không tải âm thanh về. Lời lấy từ LRCLIB
 * (kho lời mở, nhiều bài có mốc thời gian từng dòng) hoặc người học tự dán.
 * `coMoc` = false: chưa có mốc thời gian, người học dùng chế độ "Bấm theo nhịp" để tạo.
 * `lech`: số giây cộng vào mọi mốc (`lechTu` ghi đè từ một dòng trở đi), vì bản lời có thể khớp bản thu khác bản video (đoạn dạo đầu dài hơn).
 */
const baiHatSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        youtubeId: { type: String, required: true, match: /^[A-Za-z0-9_-]{11}$/ },
        tieuDe: { type: String, required: true, maxlength: 160 },
        ngheSi: { type: String, default: '', maxlength: 120 },
        lang: { type: String, enum: MA_NGON_NGU, default: 'en' },
        thoiLuong: { type: Number, default: 0 },
        nguonLoi: { type: String, enum: ['lrclib', 'tu-dan'], required: true },
        lrclibId: { type: Number, default: null },
        coMoc: { type: Boolean, default: false },
        lech: { type: Number, default: 0, min: -120, max: 120 },
        // "Chạm để khớp lại": từ dòng `dong` trở đi dùng độ lệch `lech` (bài lệch tăng dần).
        lechTu: {
            type: [{ dong: { type: Number, required: true }, lech: { type: Number, required: true }, _id: false }],
            default: [],
        },
        cau: {
            type: [{
                batDau: { type: Number, default: null },
                ketThuc: { type: Number, default: null },
                text: { type: String, required: true, maxlength: 300 },
                // Mốc TỪNG CHỮ khi bản lời có (LRC mở rộng `<mm:ss.xx>`); không có thì client ước lượng.
                tu: { type: [{ batDau: Number, text: String, _id: false }], default: undefined },
                _id: false,
            }],
            default: [],
        },
    },
    { timestamps: true, collection: 'bai_hat' },
);

baiHatSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('BaiHat', baiHatSchema);
