const mongoose = require('mongoose');

/**
 * GameConfig — hằng số game chỉnh được (singleton, key 'default').
 * Thay cho các hằng hardcode rải rác → admin tinh chỉnh không cần deploy.
 */
const gameConfigSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'default', unique: true },
        // CÔNG TẮC TỔNG cho khoá tính năng theo Level. false = mở hết cho mọi
        // người, khỏi phải gạt isActive từng dòng ở tab "Mốc mở khoá" rồi phải
        // nhớ đã gạt những dòng nào để bật lại.
        // Khác `User.bypassFeatureLock`: cờ kia miễn cho MỘT tài khoản (tài khoản
        // demo), cái này tắt cho TẤT CẢ.
        // Mặc định true — thiếu trường (config lưu từ trước khi có ô này) phải
        // hiểu là ĐANG KHOÁ, không được mở toang.
        featureUnlockEnabled: { type: Boolean, default: true },
        // Giới hạn kho từ vựng cá nhân / từ yêu thích (bảo vệ DB).
        maxUploadWords: { type: Number, default: 500 },
        maxFavorites: { type: Number, default: 100 },
        // Phí gia hạn 1 từ vựng (xu). VIP miễn phí (xử lý ở controller).
        extendCostPerWord: { type: Number, default: 100 },
        // Số thẻ boost (mỗi loại) tặng kèm khi mua VIP.
        vipBoostCards: { type: Number, default: 3 },
    },
    { timestamps: true, collection: 'game_config' }
);

gameConfigSchema.statics.getConfig = async function () {
    let cfg = await this.findOne({ key: 'default' });
    if (!cfg) cfg = await this.create({ key: 'default' });
    return cfg;
};

module.exports = mongoose.model('GameConfig', gameConfigSchema);
