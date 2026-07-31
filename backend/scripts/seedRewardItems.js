/**
 * Gắn PHẦN THƯỞNG VẬT PHẨM cho nhiệm vụ & thành tích (rewardItems).
 *
 * Trước đây gần như chỉ thưởng xu/đá quý/XP — vật phẩm mới là thứ người chơi
 * cảm nhận được ngay, nhất là thẻ hồi ⚡ vì năng lượng là cái chặn lượt chơi.
 *
 * NGUYÊN TẮC:
 *   • KHÔNG phát đồ hạng VIP (nền VIP, thẻ x2 XP/Coins, thẻ x3 XP, cosmetic
 *     legendary) — phát free thì mua VIP còn nghĩa gì nữa.
 *   • Chia mức theo xu đang thưởng: mốc càng lớn, vật phẩm càng xịn.
 *   • CỘNG THÊM chứ không ghi đè: nhiệm vụ đã có vé quay thì giữ nguyên.
 *   • Mốc nhỏ (<500 xu) và nhiệm vụ hằng ngày giữ nguyên — thưởng dày quá thì
 *     ⚡ hết là giới hạn, mà cửa hàng cũng hết lý do tồn tại.
 *
 *   node scripts/seedRewardItems.js           # xem trước (không ghi)
 *   node scripts/seedRewardItems.js --apply    # ghi vào DB
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const QuestDefinition = require('../models/QuestDefinition');
const AchievementDefinition = require('../models/AchievementDefinition');

const APPLY = process.argv.includes('--apply');

const X2 = { itemId: 'boost-energy-x2-card', quantity: 1 };
const X3 = { itemId: 'boost-energy-x3-card', quantity: 1 };
const FULL = { itemId: 'energy-full-card', quantity: 1 };
const SPIN = (n) => ({ itemId: 'spin-ticket', quantity: n });

/** Nhiệm vụ → vật phẩm thêm vào (null = không đụng). */
function questReward(q) {
    const coins = q.rewardCoins || 0;
    if (q.type === 'special') return [SPIN(2), X3];
    if (q.type === 'weekly') return [FULL];
    if (q.type === 'monthly') {
        if (coins >= 1000) return [X3];
        if (coins >= 500) return [X2];
    }
    return null; // daily + monthly nhỏ: giữ nguyên
}

/** Thành tích → vật phẩm thêm vào (null = không đụng). */
function achievementReward(a) {
    const coins = a.rewardCoins || 0;
    if (coins >= 2000) return [X3, SPIN(1)];
    if (coins >= 1000) return [FULL];
    if (coins >= 500) return [X2];
    return null;
}

/** Gộp: bỏ qua itemId đã có sẵn để chạy lại nhiều lần không nhân đôi phần thưởng. */
function merge(existing, additions) {
    const have = new Set((existing || []).map(i => i && i.itemId));
    const add = additions.filter(i => !have.has(i.itemId));
    return add.length ? { list: [...(existing || []), ...add], add } : null;
}

async function run(Model, label, pick, idField) {
    const docs = await Model.find({}).lean();
    let changed = 0;
    const sample = [];

    for (const d of docs) {
        const additions = pick(d);
        if (!additions) continue;
        const merged = merge(d.rewardItems, additions);
        if (!merged) continue;

        changed++;
        if (sample.length < 6) {
            sample.push(`  ${d[idField]} (${d.rewardCoins} xu) + ${merged.add.map(i => `${i.itemId}×${i.quantity}`).join(', ')}`);
        }
        if (APPLY) await Model.updateOne({ _id: d._id }, { $set: { rewardItems: merged.list } });
    }

    console.log(`${label}: ${changed}/${docs.length} ${APPLY ? 'đã cập nhật' : 'sẽ cập nhật'}`);
    sample.forEach(s => console.log(s));
    return changed;
}

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(APPLY ? '=== GHI VÀO DB ===' : '=== XEM TRƯỚC (chưa ghi) ===');

    await run(QuestDefinition, 'Nhiệm vụ', questReward, 'code');
    await run(AchievementDefinition, 'Thành tích', achievementReward, 'code');

    if (!APPLY) console.log('\nChạy lại với --apply để ghi thật.');
    await mongoose.disconnect();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
