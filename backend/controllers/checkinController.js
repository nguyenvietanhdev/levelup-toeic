/**
 * Điểm danh hằng tuần — 7 slot, reset thứ 2 mỗi tuần.
 *  - GET  /api/checkin         → trả rewards + claimedDays + currentDay
 *  - POST /api/checkin/claim   → claim slot ngày hôm nay nếu chưa claim
 *
 * Day-of-week: thứ 2 = 1, thứ 3 = 2, …, CN = 7.
 * weekKey: 'YYYY-WNN' (ISO week, dùng services/questPeriod để đồng nhất).
 */
const UserCheckin = require('../models/UserCheckin');
const UserStats = require('../models/UserStats');
const UserProfile = require('../models/UserProfile');
const { getPeriodKey } = require('../services/questPeriod');
const { awardXp } = require('../utils/userStateHelper');
const { logTxn } = require('../utils/economyLog');

// Phần thưởng 7 ngày (mix coins/xp/gems, tăng dần, ngày 7 combo lớn).
const WEEKLY_REWARDS = [
    { day: 1, icon: '🪙', label: '+100 Coins',         coins: 100, xp: 0,   gems: 0  },
    { day: 2, icon: '⭐', label: '+50 XP',            coins: 0,   xp: 50,  gems: 0  },
    { day: 3, icon: '💎', label: '+5 Gems',           coins: 0,   xp: 0,   gems: 5  },
    { day: 4, icon: '🪙', label: '+250 Coins',         coins: 250, xp: 0,   gems: 0  },
    { day: 5, icon: '⭐', label: '+150 XP',           coins: 0,   xp: 150, gems: 0  },
    { day: 6, icon: '💎', label: '+10 Gems',          coins: 0,   xp: 0,   gems: 10 },
    { day: 7, icon: '🎁', label: 'COMBO +500/300/20',  coins: 500, xp: 300, gems: 20 },
];

/** Thứ trong tuần kiểu Mon=1..Sun=7. */
function todayDow(d = new Date()) {
    const js = d.getDay(); // Sun=0..Sat=6
    return ((js + 6) % 7) + 1; // Mon=1..Sun=7
}

/** Trả/tạo doc của user, reset claimedDays nếu sang tuần mới. */
async function ensureDoc(userId) {
    const week = getPeriodKey('weekly');
    let doc = await UserCheckin.findOne({ userId });
    if (!doc) {
        doc = await UserCheckin.create({ userId, weekKey: week, claimedDays: [] });
    } else if (doc.weekKey !== week) {
        doc.weekKey = week;
        doc.claimedDays = [];
        await doc.save();
    }
    return doc;
}

exports.getCheckin = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const doc = await ensureDoc(userId);
        res.json({
            success: true,
            data: {
                weekKey: doc.weekKey,
                currentDay: todayDow(),
                claimedDays: doc.claimedDays,
                rewards: WEEKLY_REWARDS,
            },
        });
    } catch (err) { next(err); }
};

exports.claim = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const doc = await ensureDoc(userId);
        const day = todayDow();
        if (doc.claimedDays.includes(day)) {
            return res.status(400).json({ success: false, message: 'Đã điểm danh hôm nay rồi' });
        }
        const reward = WEEKLY_REWARDS.find(r => r.day === day);
        if (!reward) return res.status(400).json({ success: false, message: 'Không có phần thưởng cho ngày này' });

        doc.claimedDays.push(day);
        doc.lastClaimDate = new Date();
        await doc.save();

        // Cộng thưởng vào UserStats
        const stats = await UserStats.findOne({ userId });
        if (stats) {
            const profile = await UserProfile.findOne({ userId });
            if (reward.coins) stats.coins += reward.coins;
            // Cộng XP có áp lên cấp ngay (giữ level khớp xp) — xem awardXp.
            if (reward.xp && profile) awardXp(profile, stats, reward.xp);
            if (reward.gems) stats.gems += reward.gems;
            await Promise.all([stats.save(), profile?.save()]);
            if (reward.coins) logTxn(userId, { type: 'checkin', direction: 'in', name: `Điểm danh ngày ${day}`, amount: reward.coins, currency: 'coins', balanceAfter: stats.coins });
            if (reward.gems)  logTxn(userId, { type: 'checkin', direction: 'in', name: `Điểm danh ngày ${day}`, amount: reward.gems, currency: 'gems', balanceAfter: stats.gems });
        }

        res.json({
            success: true,
            message: 'Điểm danh thành công!',
            data: {
                day, reward,
                claimedDays: doc.claimedDays,
            },
        });
    } catch (err) { next(err); }
};
