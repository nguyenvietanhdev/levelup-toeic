/**
 * Reconcile level ↔ xp cho toàn bộ user.
 *
 * Bối cảnh: trước đây một số nguồn thưởng phụ (điểm danh, nhiệm vụ, quà, thành
 * tích, vòng quay) cộng `UserStats.xp` mà quên áp lên cấp, khiến xp dồn lại nhưng
 * `UserProfile.level` đứng yên. Feature-unlock đọc UserProfile.level nên user bị
 * khoá oan dù đã đủ level. Script này áp `applyLevelUp` cho mọi user để đưa
 * level về đúng với xp đã tích.
 *
 *   node scripts/reconcileLevels.js            # dry-run (chỉ in ra)
 *   node scripts/reconcileLevels.js --apply    # ghi thật
 */
require('dotenv').config();
const mongoose = require('mongoose');
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const { applyLevelUp } = require('../utils/userStateHelper');

const APPLY = process.argv.includes('--apply');

(async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/toeic';
    await mongoose.connect(uri);
    console.log(`DB: ${mongoose.connection.name} | mode: ${APPLY ? 'APPLY (ghi)' : 'DRY-RUN'}`);

    const profiles = await UserProfile.find({}).select('userId username displayName level currentLevelXp');
    let changed = 0;

    for (const profile of profiles) {
        const stats = await UserStats.findOne({ userId: profile.userId });
        if (!stats) continue;

        const before = { level: profile.level, xp: stats.xp };
        const r = applyLevelUp(profile, stats);
        if (!r.leveledUp) continue;

        changed++;
        const name = profile.displayName || profile.username;
        console.log(
            `  ${name}: L${before.level} (xp=${before.xp}) → L${profile.level} (xp=${stats.xp})` +
            ` | +${r.coinsReward} xu thưởng lên cấp`
        );
        if (APPLY) {
            stats.coins += r.coinsReward;
            await Promise.all([profile.save(), stats.save()]);
        }
    }

    console.log(changed ? `\nTong: ${changed} user lech level.` : '\nKhong co user nao lech level.');
    if (!APPLY && changed) console.log('Chay lai voi --apply de ghi.');
    await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
