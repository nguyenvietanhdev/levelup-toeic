// Ba loại boost dùng chung một cơ chế, chỉ khác tên field trên UserStats.
// Gom lại một bảng để luật "không chồng chéo" áp đồng nhất cho cả ba —
// trước đây nhánh xp/coins ghi đè vô điều kiện nên bật x2 lúc đang x3 là TỤT
// hệ số, còn nhánh energy thì âm thầm bỏ qua làm người chơi mất thẻ.
const BOOST_FIELDS = {
    xp: ['xpBoostActive', 'xpBoostMultiplier', 'xpBoostExpiresAt'],
    coins: ['coinsBoostActive', 'coinsBoostMultiplier', 'coinsBoostExpiresAt'],
    energy: ['energyBoostActive', 'energyBoostMultiplier', 'energyBoostExpiresAt'],
};

/** Boost đang CHẠY của một loại (null nếu không có / đã hết hạn). */
function activeBoost(stats, boostType, at = Date.now()) {
    const f = BOOST_FIELDS[boostType];
    if (!f) return null;
    const [activeKey, multKey, expKey] = f;
    if (!stats?.[activeKey] || !stats[expKey]) return null;
    const until = new Date(stats[expKey]).getTime();
    if (until <= at) return null;
    return { multiplier: Math.max(1, stats[multKey] || 1), until };
}

/**
 * Lý do KHÔNG được kích hoạt thẻ boost này, hoặc null nếu được.
 * Mỗi loại boost chỉ một hiệu ứng chạy tại một thời điểm: đang x3 mà dùng x2
 * thì chặn thẳng ở đây — để nó đi qua thì thẻ bị tiêu mà chẳng đổi được gì.
 * Gọi TRƯỚC khi trừ đồ / trừ tiền.
 */
function boostBlockReason(stats, effect) {
    if (effect?.type !== 'boost') return null;
    const cur = activeBoost(stats, effect.boostType);
    if (!cur) return null;
    if ((Number(effect.multiplier) || 1) < cur.multiplier) {
        return `Đang có hiệu ứng x${cur.multiplier} mạnh hơn đang chạy — thẻ x${effect.multiplier} sẽ không có tác dụng. Chờ hết hạn rồi hãy dùng.`;
    }
    return null;
}

/**
 * Apply a purchased shop item's effect onto a mutable stats object.
 * Pure domain logic (no DB / no req-res) — extracted verbatim from
 * userStateController so it can be unit-tested and reused. The money path:
 * behaviour MUST stay identical.
 *
 * @param {object} stats   user stats (mutated in place)
 * @param {object} effect  { type, amount?, duration?, boostType?, multiplier?, items? }
 */
function applyShopEffect(stats, effect) {
    switch (effect.type) {
        case 'energy':
            stats.energy = Math.min(stats.energy + effect.amount, stats.maxEnergy);
            break;
        // Nạp ĐẦY, không cộng theo số cố định: maxEnergy đổi theo người chơi nên
        // một gói "đầy bình" đúng nghĩa phải bám trần hiện tại, không phải một
        // con số ghi cứng trong catalog.
        case 'energy_full':
            stats.energy = stats.maxEnergy;
            break;
        case 'hints':
            stats.hints += effect.amount;
            break;
        case 'shield':
            stats.shields += effect.amount;
            break;
        case 'timeFreeze':
            stats.timeFreezes += effect.amount;
            break;
        case 'coins':
            stats.coins += effect.amount;
            break;
        case 'gems':
            stats.gems += effect.amount;
            break;
        // Mỗi loại boost chỉ MỘT hiệu ứng chạy cùng lúc (không chồng chéo):
        //  - hệ số cao hơn  → nâng cấp ngay, và không bao giờ rút ngắn hạn cũ
        //    (thời gian đã mua không được phép mất);
        //  - hệ số bằng nhau → GIA HẠN, cộng dồn thêm thời lượng thẻ;
        //  - hệ số thấp hơn  → không làm gì (route đã chặn từ trước khi trừ đồ,
        //    đây là chốt cuối để không bao giờ tụt hệ số).
        case 'boost': {
            const fields = BOOST_FIELDS[effect.boostType];
            if (!fields) break;   // boostType rỗng/lạ → bỏ qua, khỏi ghi rác lên stats
            const [activeKey, multKey, expKey] = fields;

            const ms = (Number(effect.duration) || 0) * 1000;
            const mult = Number(effect.multiplier) || 1;
            const cur = activeBoost(stats, effect.boostType);
            if (cur && mult < cur.multiplier) break;

            stats[activeKey] = true;
            stats[multKey] = cur ? Math.max(cur.multiplier, mult) : mult;
            if (!cur) stats[expKey] = new Date(Date.now() + ms);
            else if (cur.multiplier === mult) stats[expKey] = new Date(cur.until + ms);
            else stats[expKey] = new Date(Math.max(cur.until, Date.now() + ms));
            break;
        }
        case 'vip': {
            // VIP = năng lượng không trừ (xử lý ở client useEnergy). x2 XP/Coins
            // KHÔNG còn auto — thay bằng thẻ boost on_use grant kèm (xem shopController).
            // Cộng dồn hạn nếu đang còn VIP.
            const base = stats.vipExpiresAt && new Date(stats.vipExpiresAt) > new Date()
                ? new Date(stats.vipExpiresAt).getTime()
                : Date.now();
            stats.vipExpiresAt = new Date(base + effect.duration * 1000);
            break;
        }
        case 'combo':
            for (const sub of effect.items) applyShopEffect(stats, sub);
            break;
        default:
            break;
    }
}

module.exports = { applyShopEffect, activeBoost, boostBlockReason, BOOST_FIELDS };
