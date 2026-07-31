const mongoose = require('mongoose');

/**
 * Cấu hình Vòng quay (singleton). Admin chỉnh được danh sách phần thưởng + tỷ lệ
 * (dạng TRỌNG SỐ, server tự chuẩn hoá) cho 3 chế độ free/coin/gem + chi phí.
 */
const prizeSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ['coins', 'gems', 'xp', 'energy', 'hints', 'item'], required: true },
        amount: { type: Number, required: true },
        // Khi type = 'item': itemId của vật phẩm inventory (spin-ticket, boost-xp-card, bg-vip-week…).
        itemId: { type: String, default: '' },
        label: { type: String, required: true },
        icon: { type: String, default: '🎁' },
        // Ảnh phần thưởng — ưu tiên hơn icon khi hiển thị ô quay.
        image: { type: String, default: '' },
        color: { type: String, default: '#888888' },
        // Trọng số theo chế độ (không cần cộng = 1; server tự normalize)
        prob: {
            free: { type: Number, default: 1 },
            coin: { type: Number, default: 1 },
            gem: { type: Number, default: 1 },
        },
    },
    { _id: false }
);

const spinConfigSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'default', unique: true },
        costs: {
            coin: { type: Number, default: 100 },
            gem: { type: Number, default: 5 },
        },
        prizes: { type: [prizeSchema], default: [] },
    },
    { timestamps: true }
);

const DEFAULT_PRIZES = [
    { type: 'coins',  amount: 50,  label: '50 Xu',   icon: '🪙', color: '#f59e0b', prob: { free: 0.28, coin: 0.25, gem: 0.05 } },
    { type: 'gems',   amount: 5,   label: '5 Đá',    icon: '💎', color: '#8b5cf6', prob: { free: 0.18, coin: 0.15, gem: 0.10 } },
    { type: 'xp',     amount: 100, label: '100 XP',  icon: '⭐', color: '#06b6d4', prob: { free: 0.18, coin: 0.18, gem: 0.15 } },
    { type: 'coins',  amount: 100, label: '100 Xu',  icon: '🪙', color: '#f97316', prob: { free: 0.14, coin: 0.16, gem: 0.20 } },
    { type: 'coins',  amount: 200, label: '200 Xu',  icon: '🪙', color: '#ef4444', prob: { free: 0.10, coin: 0.12, gem: 0.20 } },
    { type: 'gems',   amount: 10,  label: '10 Đá',   icon: '💎', color: '#ec4899', prob: { free: 0.06, coin: 0.07, gem: 0.15 } },
    { type: 'energy', amount: 100, label: 'Nạp NL',  icon: '⚡', color: '#10b981', prob: { free: 0.04, coin: 0.05, gem: 0.10 } },
    { type: 'hints',  amount: 2,   label: '2 Gợi ý', icon: '💡', color: '#3b82f6', prob: { free: 0.02, coin: 0.02, gem: 0.05 } },
];

/** Lấy config (tạo mặc định nếu chưa có). */
spinConfigSchema.statics.getConfig = async function () {
    let cfg = await this.findOne({ key: 'default' });
    if (!cfg) {
        cfg = await this.create({ key: 'default', costs: { coin: 100, gem: 5 }, prizes: DEFAULT_PRIZES });
    }
    return cfg;
};

spinConfigSchema.statics.DEFAULT_PRIZES = DEFAULT_PRIZES;

module.exports = mongoose.model('SpinConfig', spinConfigSchema);
