/**
 * Quest evaluator registry — nguồn sự thật cho quest source='computed'.
 *
 * Mỗi evaluator là async (userId, snapshot, params, periodStart) → number
 * (giá trị progress hiện tại). Server đọc thẳng UserStats/DB, so với
 * `snapshot` (chụp lúc generateQuests) để ra delta của period. Không phụ
 * thuộc client emit event — mất event = không sao, lần đọc kế tiếp vẫn đúng.
 *
 * Thêm metric mới = thêm 1 entry vào `evaluators` + capture field tương ứng
 * trong `captureSnapshot` nếu cần baseline.
 */
const UserStats = require('../models/UserStats');
const ToeicAttempt = require('../models/ToeicAttempt');
const User = require('../models/User');

function num(v) { return typeof v === 'number' ? v : 0; }

/** Lấy `modeStats` ra dạng object thuần — Mongoose Map vs lean Object đều OK. */
function readModeStats(stats) {
    const ms = stats?.modeStats;
    if (!ms) return {};
    if (ms instanceof Map) {
        const out = {};
        for (const [k, v] of ms) out[k] = { played: num(v?.played) };
        return out;
    }
    const out = {};
    for (const k of Object.keys(ms)) out[k] = { played: num(ms[k]?.played) };
    return out;
}

const evaluators = {
    // Delta metrics — current value trừ baseline lúc tạo period.
    'correct-answers': async (userId, snap) => {
        const s = await UserStats.findOne({ userId }).select('totalCorrectAnswers').lean();
        return Math.max(0, num(s?.totalCorrectAnswers) - num(snap?.totalCorrectAnswers));
    },
    'complete-games': async (userId, snap) => {
        const s = await UserStats.findOne({ userId }).select('totalGamesPlayed').lean();
        return Math.max(0, num(s?.totalGamesPlayed) - num(snap?.totalGamesPlayed));
    },
    'learn-words': async (userId, snap) => {
        const s = await UserStats.findOne({ userId }).select('wordsLearned').lean();
        const cur = Array.isArray(s?.wordsLearned) ? s.wordsLearned.length : 0;
        return Math.max(0, cur - num(snap?.wordsLearnedLen));
    },
    'earn-xp': async (userId, snap) => {
        const s = await UserStats.findOne({ userId }).select('totalXp').lean();
        return Math.max(0, num(s?.totalXp) - num(snap?.totalXp));
    },
    'perfect-rounds': async (userId, snap) => {
        const s = await UserStats.findOne({ userId }).select('perfectRounds').lean();
        return Math.max(0, num(s?.perfectRounds) - num(snap?.perfectRounds));
    },
    'play-mode': async (userId, snap, params) => {
        const mode = params?.mode;
        if (!mode) return 0;
        const s = await UserStats.findOne({ userId }).select('modeStats').lean();
        const cur = readModeStats(s)[mode]?.played || 0;
        const before = snap?.modeStats?.[mode]?.played || 0;
        return Math.max(0, cur - before);
    },

    // Snapshot metrics — đọc trực tiếp giá trị hiện tại (không trừ baseline).
    'daily-streak': async (userId) => {
        const s = await UserStats.findOne({ userId }).select('streakCurrent').lean();
        return num(s?.streakCurrent);
    },

    // Filter-by-period metrics — đếm record trong khoảng [periodStart, now).
    'complete-toeic': async (userId, _snap, _params, periodStart) => {
        const filter = { userId };
        if (periodStart) filter.completedAt = { $gte: periodStart };
        return await ToeicAttempt.countDocuments(filter);
    },

    // "Đăng nhập hôm nay" — chỉ cần mở app là tick. authController.getMe
    // đã cập nhật User.lastLoginAt khi sang ngày mới, nên evaluator chạy
    // ngay sau /auth/me là thấy 1.
    'login-today': async (userId, _snap, _params, periodStart) => {
        if (!periodStart) return 1; // special quest không có period → coi như đã đăng nhập
        const u = await User.findById(userId).select('lastLoginAt').lean();
        if (!u?.lastLoginAt) return 0;
        return new Date(u.lastLoginAt) >= new Date(periodStart) ? 1 : 0;
    },
};

/**
 * Chụp baseline UserStats lúc tạo period. Chỉ chứa các field evaluator cần
 * để tính delta. Lưu vào UserQuest.startSnapshot.
 */
async function captureSnapshot(userId) {
    const s = await UserStats.findOne({ userId })
        .select('totalCorrectAnswers totalGamesPlayed wordsLearned totalXp perfectRounds modeStats')
        .lean();
    if (!s) return {};
    return {
        totalCorrectAnswers: num(s.totalCorrectAnswers),
        totalGamesPlayed:    num(s.totalGamesPlayed),
        wordsLearnedLen:     Array.isArray(s.wordsLearned) ? s.wordsLearned.length : 0,
        totalXp:             num(s.totalXp),
        perfectRounds:       num(s.perfectRounds),
        modeStats:           readModeStats(s),
    };
}

/**
 * Tính mốc bắt đầu period từ (questType, periodKey) đã được questPeriod sinh ra.
 * Trả về Date — dùng cho filter-by-period evaluator.
 */
function parsePeriodStart(type, periodKey) {
    if (type === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
        const d = new Date(periodKey + 'T00:00:00');
        return isNaN(d) ? null : d;
    }
    if (type === 'monthly' && /^\d{4}-\d{2}$/.test(periodKey)) {
        const d = new Date(periodKey + '-01T00:00:00');
        return isNaN(d) ? null : d;
    }
    if (type === 'weekly') {
        const m = /^(\d{4})-W(\d{2})$/.exec(periodKey);
        if (!m) return null;
        const y = parseInt(m[1], 10);
        const w = parseInt(m[2], 10);
        // Khớp với getPeriodKey (Monday-based, week tính từ Jan 1)
        const jan1 = new Date(y, 0, 1);
        const monday = new Date(jan1);
        const offsetToMon = (jan1.getDay() || 7) - 1; // 0..6
        monday.setDate(jan1.getDate() - offsetToMon + (w - 1) * 7);
        monday.setHours(0, 0, 0, 0);
        return monday;
    }
    return null; // special: không lọc theo thời gian
}

/**
 * Re-evaluate mọi quest có source='computed' trong 1 UserQuest doc.
 * Cập nhật progress + completed. Caller tự `await doc.save()` nếu changed.
 * @returns true nếu có thay đổi (caller nên save).
 */
async function refreshDoc(doc) {
    if (!doc?.quests?.length) return false;
    const periodStart = doc.periodStart || parsePeriodStart(doc.questType, doc.periodKey);
    const snapshot = doc.startSnapshot || {};
    let changed = false;

    for (const q of doc.quests) {
        if (q.claimedAt) continue;       // đã claim — đóng băng
        if (q.source !== 'computed') continue;
        const fn = evaluators[q.metric];
        if (!fn) continue;

        let newVal;
        try {
            newVal = await fn(doc.userId, snapshot, q.params || {}, periodStart);
        } catch (err) {
            // Một evaluator hỏng không được làm vỡ cả request — log + bỏ qua.
            console.warn('[questEvaluators]', q.metric, 'failed:', err.message);
            continue;
        }
        const clamped = Math.min(q.target, Math.max(0, num(newVal)));

        if (!q.completed) {
            // Trước khi hoàn thành, progress có thể lên/xuống (vd daily-streak
            // reset). Sau khi hoàn thành, đóng băng để không un-complete user.
            if (clamped !== q.progress) {
                q.progress = clamped;
                changed = true;
            }
            if (q.progress >= q.target) {
                q.completed = true;
                q.completedAt = new Date();
                doc.totalCompleted = num(doc.totalCompleted) + 1;
                changed = true;
            }
        }
    }
    return changed;
}

module.exports = { evaluators, captureSnapshot, parsePeriodStart, refreshDoc };
