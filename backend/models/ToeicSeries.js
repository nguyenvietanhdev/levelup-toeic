const mongoose = require('mongoose');

// Danh mục BỘ ĐỀ TOEIC ("ETS 2026", "ETS 2025"…). Admin tự quản nên thanh lọc
// bên Full Test dựng từ dữ liệu THẬT, thay cho cách cũ là cắt regex từ tên đề
// (đặt tên lệch chuẩn một chữ là đề rơi ra khỏi bộ, hoặc tự thành một bộ rác).
//
// Khớp đề vào bộ theo TIỀN TỐ source key: bộ khai `ets26` thì mọi đề có source
// `ets26t1`…`ets26t10` tự vào bộ — thêm đề mới không phải mở lại danh mục.
// Xem utils/toeicSeries.js cho luật khớp.
const toeicSeriesSchema = new mongoose.Schema(
    {
        displayName: {
            type: String,
            required: [true, 'Tên bộ đề là bắt buộc'],
            trim: true,
        },
        // Tiền tố source key. Luôn lưu lowercase (source của đề cũng lowercase)
        // để so khớp không phân biệt hoa thường mà không cần regex lúc query.
        keys: {
            type: [String],
            required: true,
            validate: {
                validator: (v) => Array.isArray(v) && v.length > 0,
                message: 'Phải có ít nhất một từ khoá (tiền tố source key)',
            },
        },
        order: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true, collection: 'toeic_series' }
);

toeicSeriesSchema.index({ isActive: 1, order: 1 });
toeicSeriesSchema.index({ keys: 1 });

module.exports = mongoose.model('ToeicSeries', toeicSeriesSchema);
