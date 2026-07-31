const UserQuest = require('../models/UserQuest');
const UserStats = require('../models/UserStats');
const UserProfile = require('../models/UserProfile');
const QuestDefinition = require('../models/QuestDefinition');
const { awardXp } = require('../utils/userStateHelper');
const logger = require('../utils/logger');
// Period math moved to services/questPeriod.js (Phase 3).
const { getPeriodKey, getNextReset } = require('../services/questPeriod');
// Phase B: evaluator chạy server-side đọc UserStats/DB (không phụ thuộc client emit).
const { captureSnapshot, parsePeriodStart, refreshDoc } = require('../services/questEvaluators');
const Inventory = require('../services/inventoryService');
const { logTxn } = require('../utils/economyLog');

// How many quests to assign per type. Phase A: cấp nhiều hơn để bớt cảm
// giác "ai cũng giống nhau" — kết hợp với pool defaults mở rộng (xem
// seedDefaults bên dưới) sẽ ra mix đa dạng hơn.
const QUEST_COUNT = { daily: 6, weekly: 4, monthly: 3, special: 5 };

// Deterministic seeded random từ chuỗi seed — dùng để mọi tài khoản nhận
// cùng bộ nhiệm vụ trong cùng period (seed = type + periodKey).
function seededRng(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return () => {
        h ^= h << 13; h = h >>> 0;
        h ^= h >> 17; h = h >>> 0;
        h ^= h << 5;  h = h >>> 0;
        return h / 0x100000000;
    };
}

async function generateQuests(userId, type, periodKey) {
    const defs = await QuestDefinition.find({ type, isActive: true }).lean();
    if (!defs.length) return null;

    const count = QUEST_COUNT[type] || 3;
    // special dùng random per-user; daily/weekly/monthly dùng deterministic
    // seed theo periodKey để mọi tài khoản nhận cùng bộ nhiệm vụ.
    const selected = type === 'special'
        ? weightedSample(defs, count)
        : weightedSampleSeeded(defs, count, `${type}:${periodKey}`);

    const entries = selected.map(d => ({
        questDefinitionId: d._id,
        code:        d.code,
        name:        d.name,
        description: d.description || '',
        icon:        d.icon || '',
        mode:        d.mode || 'any',
        metric:      d.metric || '',
        source:      d.source || 'computed',
        // Auto-derive params cho play-mode: evaluator cần params.mode = chế độ.
        // Cho phép admin chỉ set metric='play-mode' + mode='speed-quiz' là đủ,
        // khỏi phải gõ JSON params.
        params:      (d.params && Object.keys(d.params).length) ? d.params
                     : (d.metric === 'play-mode' && d.mode && d.mode !== 'any')
                         ? { mode: d.mode } : {},
        target:      d.target,
        rewardCoins: d.rewardCoins || 0,
        rewardXp:    d.rewardXp || 0,
        rewardGems:  d.rewardGems || 0,
        rewardItems: Array.isArray(d.rewardItems) ? d.rewardItems : [],
        progress:    0,
        completed:   false,
    }));

    // Chụp baseline UserStats tại thời điểm tạo period — evaluator dùng để
    // tính delta. Không có UserStats (user mới) → snapshot = {} (mọi delta
    // sẽ tính từ 0 → đúng nghĩa "trong period này").
    const startSnapshot = await captureSnapshot(userId);
    const periodStart = parsePeriodStart(type, periodKey) || new Date();

    const doc = await UserQuest.create({
        userId, questType: type, periodKey,
        startSnapshot, periodStart,
        quests: entries,
    });
    return doc;
}

function weightedSample(items, n) {
    if (items.length <= n) return [...items];
    const pool = [...items];
    const result = [];
    for (let i = 0; i < n; i++) {
        const totalWeight = pool.reduce((s, it) => s + (it.weight || 1), 0);
        let rnd = Math.random() * totalWeight;
        const idx = pool.findIndex(it => { rnd -= (it.weight || 1); return rnd <= 0; });
        result.push(pool.splice(idx === -1 ? 0 : idx, 1)[0]);
    }
    return result;
}

function weightedSampleSeeded(items, n, seed) {
    if (items.length <= n) return [...items];
    const rng = seededRng(seed);
    const pool = [...items];
    const result = [];
    for (let i = 0; i < n; i++) {
        const totalWeight = pool.reduce((s, it) => s + (it.weight || 1), 0);
        let rnd = rng() * totalWeight;
        const idx = pool.findIndex(it => { rnd -= (it.weight || 1); return rnd <= 0; });
        result.push(pool.splice(idx === -1 ? 0 : idx, 1)[0]);
    }
    return result;
}

// ── Controllers ───────────────────────────────────────────────────────────────

const getQuests = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const type = ['daily', 'weekly', 'monthly', 'special'].includes(req.query.type)
            ? req.query.type : 'daily';

        const periodKey = getPeriodKey(type);
        // KHÔNG .lean() — cần Mongoose doc để refreshDoc save lại progress.
        let doc = await UserQuest.findOne({ userId, questType: type, periodKey });

        if (!doc) {
            doc = await generateQuests(userId, type, periodKey);
            if (!doc) {
                return res.json({ success: true, data: { type, periodKey, quests: [], nextReset: getNextReset(type) } });
            }
        }

        // Top-up: nếu admin thêm quest definition mới sau khi period doc đã
        // tồn tại, tự động bổ sung vào doc của user để quest xuất hiện ngay.
        const allDefs = await QuestDefinition.find({ type, isActive: true }).lean();
        const existingCodes = new Set(doc.quests.map(q => q.code));
        const newDefs = allDefs.filter(d => !existingCodes.has(d.code));
        if (newDefs.length > 0) {
            const startSnapshot = doc.startSnapshot || {};
            for (const d of newDefs) {
                doc.quests.push({
                    questDefinitionId: d._id,
                    code: d.code, name: d.name, description: d.description || '',
                    icon: d.icon || '', mode: d.mode || 'any', metric: d.metric || '',
                    source: d.source || 'computed',
                    params: (d.params && Object.keys(d.params).length) ? d.params
                            : (d.metric === 'play-mode' && d.mode && d.mode !== 'any') ? { mode: d.mode } : {},
                    target: d.target, rewardCoins: d.rewardCoins || 0,
                    rewardXp: d.rewardXp || 0, rewardGems: d.rewardGems || 0,
                    rewardItems: Array.isArray(d.rewardItems) ? d.rewardItems : [],
                    progress: 0, completed: false,
                });
            }
            doc.markModified('quests');
        }

        // Re-evaluate mọi quest source='computed' từ UserStats — đảm bảo
        // tab Nhiệm vụ luôn hiện số liệu fresh, không phụ thuộc client emit.
        const changed = await refreshDoc(doc);
        if (changed || newDefs.length > 0) {
            doc.markModified('quests');
            await doc.save();
        }

        res.json({
            success: true,
            data: {
                type,
                periodKey,
                quests: doc.quests,
                totalCompleted: doc.totalCompleted,
                nextReset: getNextReset(type),
            },
        });
    } catch (err) {
        logger.error('getQuests error', { error: err.message });
        next(err);
    }
};

// Sync progress from client after a game session
// Body: { type, updates: [{ code, value }] }  — value is the NEW total, not delta
const syncProgress = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { type = 'daily', updates = [] } = req.body;
        if (!updates.length) return res.json({ success: true });

        const periodKey = getPeriodKey(type);
        let doc = await UserQuest.findOne({ userId, questType: type, periodKey });
        if (!doc) {
            doc = await generateQuests(userId, type, periodKey);
            if (!doc) return res.json({ success: true });
        }

        // Top-up new definitions (same logic as getQuests)
        const allDefsSync = await QuestDefinition.find({ type, isActive: true }).lean();
        const existingCodesSync = new Set(doc.quests.map(q => q.code));
        const newDefsSync = allDefsSync.filter(d => !existingCodesSync.has(d.code));
        if (newDefsSync.length > 0) {
            for (const d of newDefsSync) {
                doc.quests.push({
                    questDefinitionId: d._id,
                    code: d.code, name: d.name, description: d.description || '',
                    icon: d.icon || '', mode: d.mode || 'any', metric: d.metric || '',
                    source: d.source || 'computed',
                    params: (d.params && Object.keys(d.params).length) ? d.params
                            : (d.metric === 'play-mode' && d.mode && d.mode !== 'any') ? { mode: d.mode } : {},
                    target: d.target, rewardCoins: d.rewardCoins || 0,
                    rewardXp: d.rewardXp || 0, rewardGems: d.rewardGems || 0,
                    rewardItems: Array.isArray(d.rewardItems) ? d.rewardItems : [],
                    progress: 0, completed: false,
                });
            }
            doc.markModified('quests');
        }

        let changed = newDefsSync.length > 0;
        // 1) Quest source='event' — apply client-reported progress (max-merge).
        for (const { code, value } of updates) {
            const q = doc.quests.find(q => q.code === code);
            if (!q || q.completed) continue;
            if (q.source && q.source !== 'event') continue; // computed: server quyết
            const newProgress = Math.max(q.progress, value); // only go up
            if (newProgress !== q.progress) {
                q.progress = newProgress;
                changed = true;
            }
            if (!q.completed && q.progress >= q.target) {
                q.completed = true;
                q.completedAt = new Date();
                doc.totalCompleted += 1;
                changed = true;
            }
        }

        // 2) Quest source='computed' — re-evaluate từ UserStats để cũng fresh.
        const computedChanged = await refreshDoc(doc);
        changed = changed || computedChanged;

        if (changed) {
            doc.markModified('quests');
            await doc.save();
        }

        res.json({ success: true, data: { quests: doc.quests, totalCompleted: doc.totalCompleted } });
    } catch (err) {
        logger.error('syncProgress error', { error: err.message });
        next(err);
    }
};

// Claim reward for a completed quest
// Body: { type, periodKey, code }
const claimReward = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { type = 'daily', code } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Missing quest code' });

        const periodKey = getPeriodKey(type);
        const doc = await UserQuest.findOne({ userId, questType: type, periodKey });
        if (!doc) return res.status(404).json({ success: false, message: 'Quest period not found' });

        const q = doc.quests.find(q => q.code === code);
        if (!q) return res.status(404).json({ success: false, message: 'Quest not found' });

        // Nếu quest chưa completed trong DB → thử re-evaluate từ UserStats một
        // lần nữa (bắt race: GameState.save() có thể vào trước claim một chút).
        // Nếu đã completed rồi → không cần re-evaluate, tránh UserStats stale
        // làm un-complete quest.
        if (!q.completed) {
            const refreshed = await refreshDoc(doc);
            if (refreshed) {
                doc.markModified('quests');
                await doc.save();
            }
            if (!q.completed) {
                return res.status(400).json({ success: false, message: 'Quest not completed yet' });
            }
        }
        if (q.claimedAt) return res.status(400).json({ success: false, message: 'Reward already claimed' });

        q.claimedAt = new Date();
        doc.totalRewards.coins += q.rewardCoins;
        doc.totalRewards.xp    += q.rewardXp;
        doc.totalRewards.gems  += q.rewardGems;

        const stats = await UserStats.findOne({ userId });
        if (stats) {
            const profile = await UserProfile.findOne({ userId });
            stats.coins += q.rewardCoins;
            // Cộng XP có áp lên cấp ngay (giữ level khớp xp) — xem awardXp.
            if (q.rewardXp && profile) awardXp(profile, stats, q.rewardXp);
            stats.gems  += q.rewardGems;
            await Promise.all([stats.save(), profile?.save()]);
            const qName = `Nhiệm vụ: ${q.name || q.code || ''}`.trim();
            if (q.rewardCoins) logTxn(userId, { type: 'quest', direction: 'in', name: qName, amount: q.rewardCoins, currency: 'coins', balanceAfter: stats.coins });
            if (q.rewardGems)  logTxn(userId, { type: 'quest', direction: 'in', name: qName, amount: q.rewardGems, currency: 'gems', balanceAfter: stats.gems });
        }

        // Thưởng thêm vật phẩm inventory (vd vé quay). Best-effort — lỗi grant
        // không làm hỏng việc claim đã lưu.
        const rewardItems = Array.isArray(q.rewardItems) ? q.rewardItems : [];
        for (const it of rewardItems) {
            if (!it?.itemId) continue;
            try {
                await Inventory.grant(userId, it.itemId, Number(it.quantity) || 1, { source: 'quest' });
            } catch (e) {
                logger.error('Quest reward grant failed:', e.message);
            }
        }

        await doc.save();

        res.json({
            success: true,
            message: 'Phần thưởng đã được nhận!',
            rewards: { coins: q.rewardCoins, xp: q.rewardXp, gems: q.rewardGems, items: rewardItems },
        });
    } catch (err) {
        logger.error('claimReward error', { error: err.message });
        next(err);
    }
};

// Seed default quest definitions (admin only)
const seedDefaults = async (req, res, next) => {
    try {
        const defaults = [
            // ─── Daily (pool mở rộng, weight đa dạng để bốc thăm 5/N ra
            //      mix khác nhau cho mỗi user mỗi ngày) ────────────────────
            { code: 'daily_complete_games',       name: 'Hoàn thành {target} lượt chơi',     description: 'Chơi bất kỳ chế độ nào',             icon: '🎮', type: 'daily',   mode: 'any',             metric: 'complete-games',  target: 5,   rewardCoins: 50,  rewardXp: 25,  weight: 3 },
            { code: 'daily_complete_games_easy',  name: 'Khởi động {target} lượt chơi',      description: 'Mục tiêu nhẹ cho ngày bận',          icon: '🎮', type: 'daily',   mode: 'any',             metric: 'complete-games',  target: 3,   rewardCoins: 30,  rewardXp: 15,  weight: 5 },
            { code: 'daily_complete_games_pro',   name: 'Chinh phục {target} lượt chơi',     description: 'Cho ai cày cuốc',                    icon: '🎮', type: 'daily',   mode: 'any',             metric: 'complete-games',  target: 10,  rewardCoins: 150, rewardXp: 80,  weight: 1 },
            { code: 'daily_correct_answers',      name: 'Trả lời đúng {target} câu',         description: 'Trả lời đúng trong bất kỳ chế độ',   icon: '✅', type: 'daily',   mode: 'any',             metric: 'correct-answers', target: 20,  rewardCoins: 75,  rewardXp: 40,  weight: 3 },
            { code: 'daily_correct_easy',         name: 'Trả lời đúng {target} câu',         description: 'Mục tiêu nhẹ',                       icon: '✅', type: 'daily',   mode: 'any',             metric: 'correct-answers', target: 10,  rewardCoins: 40,  rewardXp: 20,  weight: 5 },
            { code: 'daily_correct_hard',         name: 'Trả lời đúng {target} câu',         description: 'Thách thức ngày',                    icon: '✅', type: 'daily',   mode: 'any',             metric: 'correct-answers', target: 40,  rewardCoins: 200, rewardXp: 100, weight: 1 },
            { code: 'daily_learn_words',          name: 'Học {target} từ mới',               description: 'Làm quen với từ vựng mới',           icon: '📚', type: 'daily',   mode: 'any',             metric: 'learn-words',     target: 15,  rewardCoins: 90,  rewardXp: 45,  weight: 3 },
            { code: 'daily_learn_words_easy',     name: 'Học {target} từ mới',               description: 'Mỗi ngày một ít',                    icon: '📚', type: 'daily',   mode: 'any',             metric: 'learn-words',     target: 5,   rewardCoins: 35,  rewardXp: 20,  weight: 5 },
            { code: 'daily_learn_words_pro',      name: 'Học {target} từ mới',               description: 'Cho người chăm chỉ',                 icon: '📚', type: 'daily',   mode: 'any',             metric: 'learn-words',     target: 30,  rewardCoins: 220, rewardXp: 120, weight: 1 },
            { code: 'daily_streak',               name: 'Duy trì streak hôm nay',            description: 'Chơi ít nhất 1 game hôm nay',        icon: '🔥', type: 'daily',   mode: 'any',             metric: 'daily-streak',    target: 1,   rewardCoins: 100, rewardXp: 50,  weight: 2 },
            { code: 'daily_login',                name: 'Đăng nhập hôm nay',                 description: 'Chỉ cần mở ứng dụng — nhận thưởng nhẹ', icon: '👋', type: 'daily', mode: 'any',             metric: 'login-today',     target: 1,   rewardCoins: 30,  rewardXp: 10,  weight: 4 },
            { code: 'daily_earn_xp',              name: 'Kiếm {target} XP',                  description: 'Tích lũy kinh nghiệm',               icon: '📈', type: 'daily',   mode: 'any',             metric: 'earn-xp',         target: 200, rewardCoins: 80,  rewardXp: 30,  weight: 2 },
            { code: 'daily_earn_xp_small',        name: 'Kiếm {target} XP',                  description: 'Mục tiêu XP nhẹ',                    icon: '📈', type: 'daily',   mode: 'any',             metric: 'earn-xp',         target: 100, rewardCoins: 40,  rewardXp: 15,  weight: 5 },
            { code: 'daily_earn_xp_big',          name: 'Kiếm {target} XP',                  description: 'Mục tiêu XP lớn',                    icon: '📈', type: 'daily',   mode: 'any',             metric: 'earn-xp',         target: 500, rewardCoins: 250, rewardXp: 120, weight: 1 },
            { code: 'daily_speed_quiz',           name: 'Chơi {target} lượt Speed Quiz',     description: 'Hoàn thành chế độ tốc độ',           icon: '⚡', type: 'daily',   mode: 'speed-quiz',      metric: 'play-mode',       target: 3,   rewardCoins: 60,  rewardXp: 35,  weight: 2 },
            { code: 'daily_flashcard',            name: 'Chơi {target} lượt Flashcard',      description: 'Học từ bằng thẻ ghi nhớ',            icon: '🃏', type: 'daily',   mode: 'flashcard',       metric: 'play-mode',       target: 3,   rewardCoins: 60,  rewardXp: 35,  weight: 3 },
            { code: 'daily_multiple_choice',      name: 'Chơi {target} lượt Trắc nghiệm',    description: 'Trả lời chính xác từng câu',         icon: '🔘', type: 'daily',   mode: 'multiple-choice', metric: 'play-mode',       target: 3,   rewardCoins: 60,  rewardXp: 35,  weight: 3 },
            { code: 'daily_listening',            name: 'Chơi {target} lượt Nghe & chọn',    description: 'Luyện tai nghe',                     icon: '🎧', type: 'daily',   mode: 'listening',       metric: 'play-mode',       target: 3,   rewardCoins: 70,  rewardXp: 40,  weight: 2 },
            { code: 'daily_synonym',              name: 'Chơi {target} lượt Đồng nghĩa',     description: 'Mở rộng vốn từ',                     icon: '🔁', type: 'daily',   mode: 'synonym-check',   metric: 'play-mode',       target: 3,   rewardCoins: 65,  rewardXp: 35,  weight: 2 },
            { code: 'daily_matching',             name: 'Chơi {target} lượt Nối từ',         description: 'Ghép nghĩa nhanh',                   icon: '🔗', type: 'daily',   mode: 'matching',        metric: 'play-mode',       target: 3,   rewardCoins: 60,  rewardXp: 30,  weight: 2 },
            { code: 'daily_pronunciation',        name: 'Chơi {target} lượt Phát âm',        description: 'Luyện nói',                          icon: '🎤', type: 'daily',   mode: 'pronunciation',   metric: 'play-mode',       target: 2,   rewardCoins: 80,  rewardXp: 40,  weight: 1 },
            { code: 'daily_phonetic',             name: 'Chơi {target} lượt Phiên âm',       description: 'Đọc IPA',                            icon: '🔤', type: 'daily',   mode: 'phonetic-quiz',   metric: 'play-mode',       target: 3,   rewardCoins: 70,  rewardXp: 35,  weight: 1 },
            { code: 'daily_perfect_rounds',       name: 'Đạt {target} vòng hoàn hảo',        description: 'Trả lời đúng toàn bộ trong 1 vòng',  icon: '⭐', type: 'daily',   mode: 'any',             metric: 'perfect-rounds',  target: 2,   rewardCoins: 100, rewardXp: 50,  weight: 2 },
            { code: 'daily_perfect_easy',         name: 'Đạt {target} vòng hoàn hảo',        description: 'Chỉ cần 1 vòng đúng hết',            icon: '⭐', type: 'daily',   mode: 'any',             metric: 'perfect-rounds',  target: 1,   rewardCoins: 50,  rewardXp: 25,  weight: 5 },
            { code: 'daily_perfect_pro',          name: 'Đạt {target} vòng hoàn hảo',        description: 'Cho cao thủ',                        icon: '⭐', type: 'daily',   mode: 'any',             metric: 'perfect-rounds',  target: 5,   rewardCoins: 250, rewardXp: 130, weight: 1 },

            // ─── Weekly ─────────────────────────────────────────────────
            { code: 'weekly_learn_words',         name: 'Học {target} từ trong tuần',        description: 'Mục tiêu từ vựng cả tuần',           icon: '📖', type: 'weekly',  mode: 'any',             metric: 'learn-words',     target: 100, rewardCoins: 300, rewardXp: 150, rewardGems: 5,  weight: 3 },
            { code: 'weekly_play_sessions',       name: 'Hoàn thành {target} lượt chơi',     description: 'Chơi đều đặn mỗi ngày trong tuần',   icon: '🎯', type: 'weekly',  mode: 'any',             metric: 'complete-games',  target: 30,  rewardCoins: 250, rewardXp: 120, rewardGems: 3,  weight: 3 },
            { code: 'weekly_correct_answers',     name: 'Trả lời đúng {target} câu',         description: 'Tổng đúng cả tuần',                  icon: '✅', type: 'weekly',  mode: 'any',             metric: 'correct-answers', target: 200, rewardCoins: 280, rewardXp: 140, rewardGems: 3,  weight: 3 },
            { code: 'weekly_perfect_rounds',      name: 'Đạt {target} vòng hoàn hảo',        description: 'Trình độ ổn định cả tuần',           icon: '⭐', type: 'weekly',  mode: 'any',             metric: 'perfect-rounds',  target: 10,  rewardCoins: 350, rewardXp: 180, rewardGems: 5,  weight: 2 },
            { code: 'weekly_earn_xp',             name: 'Kiếm {target} XP trong tuần',       description: 'Tích lũy kinh nghiệm cả tuần',       icon: '📈', type: 'weekly',  mode: 'any',             metric: 'earn-xp',         target: 1500,rewardCoins: 300, rewardXp: 100, rewardGems: 4,  weight: 2 },
            { code: 'weekly_streak',              name: 'Duy trì streak {target} ngày',      description: 'Không bỏ ngày nào trong tuần',       icon: '🔥', type: 'weekly',  mode: 'any',             metric: 'daily-streak',    target: 7,   rewardCoins: 500, rewardXp: 200, rewardGems: 10, weight: 2 },
            { code: 'weekly_speed_quiz',          name: 'Chơi {target} lượt Speed Quiz',     description: 'Cày tốc độ cả tuần',                 icon: '⚡', type: 'weekly',  mode: 'speed-quiz',      metric: 'play-mode',       target: 15,  rewardCoins: 350, rewardXp: 170, rewardGems: 4,  weight: 1 },

            // ─── Monthly ────────────────────────────────────────────────
            { code: 'monthly_learn_words',        name: 'Học {target} từ trong tháng',       description: 'Chinh phục từ vựng cả tháng',        icon: '🏆', type: 'monthly', mode: 'any',             metric: 'learn-words',     target: 500, rewardCoins: 1000, rewardXp: 500, rewardGems: 20, weight: 2 },
            { code: 'monthly_perfect_games',      name: 'Đạt {target} vòng hoàn hảo',        description: 'Thể hiện kỹ năng xuất sắc',          icon: '💎', type: 'monthly', mode: 'any',             metric: 'perfect-rounds',  target: 20,  rewardCoins: 800,  rewardXp: 400, rewardGems: 15, weight: 2 },
            { code: 'monthly_complete_games',     name: 'Hoàn thành {target} lượt chơi',     description: 'Đều đặn cả tháng',                   icon: '🎮', type: 'monthly', mode: 'any',             metric: 'complete-games',  target: 60,  rewardCoins: 900,  rewardXp: 450, rewardGems: 12, weight: 2 },
            { code: 'monthly_correct_answers',    name: 'Trả lời đúng {target} câu',         description: 'Tổng đúng cả tháng',                 icon: '✅', type: 'monthly', mode: 'any',             metric: 'correct-answers', target: 1000,rewardCoins: 950,  rewardXp: 480, rewardGems: 13, weight: 2 },
            { code: 'monthly_streak',             name: 'Duy trì streak {target} ngày',      description: 'Bền bỉ cả tháng',                    icon: '🔥', type: 'monthly', mode: 'any',             metric: 'daily-streak',    target: 21,  rewardCoins: 1200, rewardXp: 600, rewardGems: 25, weight: 1 },

            // ─── Special ────────────────────────────────────────────────
            { code: 'special_first_toeic',        name: 'Làm bài TOEIC đầu tiên',            description: 'Hoàn thành 1 bài thi TOEIC',         icon: '🎓', type: 'special', mode: 'any',             metric: 'complete-toeic',  target: 1,   rewardCoins: 500,  rewardXp: 300, rewardGems: 10, weight: 1 },
            { code: 'special_streak_7',           name: 'Streak {target} ngày liên tiếp',    description: 'Mở khoá khi giữ streak đủ dài',      icon: '🔥', type: 'special', mode: 'any',             metric: 'daily-streak',    target: 7,   rewardCoins: 600,  rewardXp: 300, rewardGems: 15, weight: 1 },
            { code: 'special_streak_30',          name: 'Streak {target} ngày liên tiếp',    description: 'Chinh phục 1 tháng không bỏ ngày nào', icon: '🌟', type: 'special', mode: 'any',             metric: 'daily-streak',    target: 30,  rewardCoins: 2000, rewardXp: 1000, rewardGems: 50, weight: 1 },
        ];

        let created = 0, skipped = 0, backfilled = 0;
        for (const d of defaults) {
            const exists = await QuestDefinition.findOne({ code: d.code });
            if (exists) {
                // Backfill `metric` cho quest cũ chưa có (đảm bảo quest đã
                // seed trước khi có metric vẫn chạy được path generic).
                // Đồng thời sửa case đặc biệt: special_first_toeic mode 'toeic'
                // (không có chế độ game tên 'toeic' → quest không bao giờ
                // match) → đổi sang 'any' để metric 'complete-toeic' quyết.
                let touched = false;
                if (d.metric && !exists.metric) { exists.metric = d.metric; touched = true; }
                if (d.code === 'special_first_toeic' && exists.mode === 'toeic') {
                    exists.mode = 'any';
                    touched = true;
                }
                // Phase B: chuyển hết def cũ sang source='computed' để evaluator
                // điều khiển. Doc cũ thường có source='' (chưa có field) → mặc
                // định Mongoose tự lấy 'computed' nhưng cẩn thận set lại.
                if (!exists.source || exists.source === 'event') {
                    exists.source = 'computed';
                    touched = true;
                }
                if (touched) { await exists.save(); backfilled++; }
                skipped++; continue;
            }
            await QuestDefinition.create(d);
            created++;
        }

        res.json({ success: true, message: `Seeded ${created} mới, ${backfilled} backfill metric, ${skipped} đã tồn tại` });
    } catch (err) {
        logger.error('seedDefaults error', { error: err.message });
        next(err);
    }
};

// Wipe TẤT CẢ user_quests (admin). Dùng 1 lần khi đổi sang source='computed'
// (doc cũ không có startSnapshot → delta sai). Sang period kế tiếp sẽ tự
// sinh lại với snapshot chuẩn.
const resetUserQuests = async (req, res, next) => {
    try {
        const result = await UserQuest.deleteMany({});
        res.json({
            success: true,
            message: `Đã xoá ${result.deletedCount} user_quest doc. Sang period kế tiếp sẽ sinh lại sạch.`,
            deletedCount: result.deletedCount,
        });
    } catch (err) {
        logger.error('resetUserQuests error', { error: err.message });
        next(err);
    }
};

module.exports = { getQuests, syncProgress, claimReward, seedDefaults, resetUserQuests };
