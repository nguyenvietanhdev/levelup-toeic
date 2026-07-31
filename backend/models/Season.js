const mongoose = require('mongoose');

/**
 * Mùa giải (Season). Hệ thống chỉ giữ MỘT mùa "active" tại một thời điểm.
 * Khi đến endAt → reset các nhóm dữ liệu được bật trong resetBuckets, lưu Hall
 * of Fame, rồi tạo mùa mới (seasonNumber + 1).
 */
const seasonSchema = new mongoose.Schema(
    {
        seasonNumber: { type: Number, default: 1, index: true },
        startAt: { type: Date, default: Date.now },
        endAt: { type: Date, required: true },
        status: { type: String, enum: ['active', 'ended'], default: 'active', index: true },

        // Nhóm dữ liệu sẽ reset khi hết mùa
        resetBuckets: {
            resources: { type: Boolean, default: true }, // vàng, đá quý, level/xp
            progress: { type: Boolean, default: true },  // thành tích, nhiệm vụ, streak
            stats: { type: Boolean, default: true },     // thống kê/hoạt động + thông báo
            learning: { type: Boolean, default: true },  // từ đã học, từ sai, yêu thích, upload
        },

        lastResetAt: { type: Date, default: null },
    },
    { timestamps: true }
);

/**
 * Lấy mùa hiện tại (active). Nếu chưa có → tạo mặc định kéo dài 30 ngày.
 */
seasonSchema.statics.getCurrent = async function () {
    let season = await this.findOne({ status: 'active' }).sort({ seasonNumber: -1 });
    if (!season) {
        season = await this.create({
            seasonNumber: 1,
            startAt: new Date(),
            endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'active',
        });
    }
    return season;
};

module.exports = mongoose.model('Season', seasonSchema);
