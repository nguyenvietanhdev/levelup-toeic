const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const UserAchievement = require('../models/UserAchievement');
const UserDailyQuest = require('../models/UserDailyQuest');
const AchievementDefinition = require('../models/AchievementDefinition');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const { buildFullState, applyEnergyRegen, applyLevelUp, awardXp } = require('../utils/userStateHelper');
const Inventory = require('../services/inventoryService');
const ItemDefinition = require('../models/ItemDefinition');
const { logTxn } = require('../utils/economyLog');
const { checkAchievementCondition } = require('../utils/achievementRules');
const { boundWordList, boundPracticeHistory } = require('../utils/stateLimits');

function expireBoosts(stats) {
    const now = Date.now();
    if (stats.xpBoostActive && stats.xpBoostExpiresAt && new Date(stats.xpBoostExpiresAt).getTime() <= now) {
        stats.xpBoostActive = false;
        stats.xpBoostMultiplier = 1;
        stats.xpBoostExpiresAt = null;
    }
    if (stats.coinsBoostActive && stats.coinsBoostExpiresAt && new Date(stats.coinsBoostExpiresAt).getTime() <= now) {
        stats.coinsBoostActive = false;
        stats.coinsBoostMultiplier = 1;
        stats.coinsBoostExpiresAt = null;
    }
}

// getShopItems / purchaseItem moved to controllers/shopController.js (P4).

exports.getState = async (req, res, next) => {
    try {
        const userId = req.user.id;
        let [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId }),
            UserStats.findOne({ userId }),
        ]);

        if (!profile || !stats) {
            const user = await User.findById(userId).select('email').lean();
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            const base = user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').substring(0, 18) || 'user';
            if (!profile) {
                const exists = await UserProfile.findOne({ username: base }).lean();
                const username = exists ? base + '_' + Date.now().toString().slice(-4) : base;
                profile = await UserProfile.create({ userId, username, displayName: username, avatar: username.charAt(0).toUpperCase() });
            }
            if (!stats) stats = await UserStats.create({ userId });
        }

        applyEnergyRegen(stats);
        expireBoosts(stats);
        await stats.save();

        const gameState = await buildFullState(req.user.id);
        res.json({ success: true, data: gameState });
    } catch (error) {
        logger.error('Error in getState:', error);
        next(error);
    }
};

exports.saveState = async (req, res, next) => {
    try {
        const state = req.body;
        const userId = req.user.id;

        let [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId }),
            UserStats.findOne({ userId }),
        ]);

        // Auto-create for accounts that pre-date the schema restructure
        if (!profile || !stats) {
            const user = await User.findById(userId).select('email').lean();
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });

            if (!profile) {
                const base = (state.user?.username || user.email.split('@')[0])
                    .replace(/[^a-zA-Z0-9_]/g, '').substring(0, 18) || 'user';
                const exists = await UserProfile.findOne({ username: base }).lean();
                const username = exists ? base + '_' + Date.now().toString().slice(-4) : base;
                profile = await UserProfile.create({
                    userId,
                    username,
                    displayName: state.user?.displayName || username,
                    avatar: state.user?.avatar || username.charAt(0).toUpperCase(),
                });
            }
            if (!stats) {
                stats = await UserStats.create({ userId });
            }
        }

        // ⚠️ SERVER-AUTHORITATIVE ECONOMY: KHÔNG tin client về tiền tệ.
        // level/xp/totalXp/coins/gems/hints/shields/timeFreezes và các counter
        // tổng (games/correct/wrong/perfect/score/playTime/modeStats) CHỈ được
        // ghi bởi các endpoint server đã xác thực (/practice/submit, /shop/purchase,
        // quest claim, achievement, checkin, toeic submit...). saveState bỏ qua
        // hết — nếu không client có thể tự bơm coins/XP/level/khiên.
        // Các field KHÔNG phải tiền tệ vẫn nhận từ client bên dưới.

        // User / profile fields — avatar đổi qua POST /api/auth/avatar; level do server.
        // (state.user.level/xp/totalXp: bỏ qua — server-authoritative)

        // Năng lượng: CHỈ NHẬN THEO HƯỚNG GIẢM.
        //
        // Trước đây gán thẳng cả `energy`, `maxEnergy` và `lastEnergyUpdate` từ
        // client, không trần — gửi `energy: 99999` là chơi vô hạn vĩnh viễn, và
        // `lastEnergyUpdate` lùi về quá khứ còn khiến applyEnergyRegen tự cộng
        // thêm. Việc này vi phạm nguyên văn quy ước trong CLAUDE.md ("Energy hồi
        // 1/phút tính server-side"). Xem SEC-be.userstate-002.
        //
        // Vì sao không bỏ sạch: hiện KHÔNG có chỗ nào trừ năng lượng phía server
        // (`rg "energy -=|$inc.*energy"` → không có). Server chỉ hồi; việc tiêu
        // do client làm rồi báo lên. Bỏ hết đường nhận thì năng lượng không bao
        // giờ giảm — thành lỗ hổng ngược lại. Chốt một chiều là chặn được gian
        // lận mà không phải dời cả cơ chế tiêu sang server ngay bây giờ.
        // Việc dời đó là bản vá đúng nghĩa — xem Long-term trong report.
        if (state.resources?.energy !== undefined) {
            const asked = Number(state.resources.energy);
            if (Number.isFinite(asked)) {
                stats.energy = Math.max(0, Math.min(stats.energy, asked));
            }
        }
        // `maxEnergy` và `lastEnergyUpdate`: KHÔNG BAO GIỜ nhận từ client.
        // maxEnergy là trần của chính cơ chế hồi; lastEnergyUpdate là mốc tính
        // thời gian hồi. Cho client đặt hai thứ này là cho nó tự viết luật.

        // Progress — chỉ danh sách từ (không phải tiền tệ). Các counter tổng
        // và modeStats do /practice/submit cập nhật → bỏ qua ở đây để khỏi
        // double-count / bị client ghi đè.
        // Ép kiểu + chặn trần. Bản cũ chỉ kiểm truthy nên một object cũng gán
        // được vào chỗ đáng lẽ là mảng, và không có giới hạn độ dài.
        // `wordsLearned` giờ là đầu vào của điều kiện thành tích, nên để client
        // ghi tuỳ ý là mở đường vòng qua bản vá SEC-be.userstate-001.
        if (state.progress) {
            const learned = boundWordList(state.progress.wordsLearned);
            const mastered = boundWordList(state.progress.wordsMastered);
            if (learned) stats.wordsLearned = learned;
            if (mastered) stats.wordsMastered = mastered;
        }

        // Streak: KHÔNG ghi từ blob client ở đây. Streak do /practice/submit
        // tính độc quyền (nguồn sự thật duy nhất). Trước đây saveState chạy ở
        // rất nhiều hành động (settings, mua đồ, save nền…) và ghi đè streak +
        // lastPlayDate bằng giá trị client có thể bị cũ → đẩy lastPlayDate lùi
        // lại → lần chơi sau daysDiff > 1 → streak bị reset về 1.

        // Quests — upsert today's UserDailyQuest
        if (state.quests?.daily && Array.isArray(state.quests.daily)) {
            const today = new Date().toISOString().split('T')[0];
            const completed = state.quests.daily.filter(q => q.completed);
            await UserDailyQuest.findOneAndUpdate(
                { userId, date: today },
                {
                    $set: {
                        quests: state.quests.daily,
                        totalCompleted: completed.length,
                    },
                },
                { upsert: true }
            );
        }

        // Thành tích: KHÔNG mở từ blob client ở đây.
        //
        // Khối cũ nhận `state.achievements` do client tự khai rồi upsert
        // UserAchievement kèm cả `claimedRewards` — mà KHÔNG cộng đồng nào. Hậu
        // quả không phải cheat mà là ngược lại: bản ghi đó khiến lần gọi
        // /user/achievement sau trả về "Achievement already unlocked", nên người
        // chơi MẤT VĨNH VIỄN phần thưởng thật. Số liệu trên DB lúc audit: 35 lần
        // mở, cả 35 đều lẽ ra sinh giao dịch thưởng, nhưng chỉ có 16 giao dịch.
        //
        // Giờ chỉ còn MỘT đường mở thành tích: POST /api/user/achievement — có
        // kiểm điều kiện, có trả thưởng, có ghi giao dịch. Xem SEC-be.userstate-004.

        // Boosts: KHÔNG ghi từ client — boost chỉ kích hoạt khi mua ở shop
        // (applyShopEffect case 'boost', server-side) và tự hết hạn (expireBoosts).
        // Nếu nhận từ client → ai cũng tự bật x2 XP/coins vĩnh viễn miễn phí.

        // Settings — CHỈ nhận những khoá đã khai trong schema.
        //
        // `Object.assign(profile.settings, state.settings)` nhận BẤT KỲ khoá nào
        // client gửi. Mongoose `strict` strip khoá lạ khi VALIDATE, nhưng
        // `markModified('settings')` bên dưới ép ghi cả nhánh — nên rác của
        // client vẫn vào được DB.
        //
        // Đã thấy hậu quả thật: `selectedSource` trong hồ sơ mang giá trị
        // "conversations" (tên một collection Mongo), không phải mã đề nào cả.
        // Rồi chế độ Hội thoại đọc trường đó và đi tìm bộ từ không tồn tại.
        if (state.settings && typeof state.settings === 'object') {
            // Lấy danh sách khoá từ MODEL, không từ instance: instance có thể
            // chưa khởi tạo `settings` (hồ sơ cũ), lúc đó danh sách rỗng và
            // KHÔNG khoá nào được ghi — mất sạch cài đặt mà không lỗi nào báo.
            const allowed = Object.keys(
                UserProfile.schema.path('settings')?.schema?.paths || {}
            );
            for (const k of allowed) {
                if (k === '_id' || k === '__v') continue;
                if (Object.prototype.hasOwnProperty.call(state.settings, k)) {
                    profile.settings[k] = state.settings[k];
                }
            }
            profile.markModified('settings');
        }

        // Practice history — cắt theo trần để một tài khoản không tự đẩy
        // document của mình tới ngưỡng 16MB của MongoDB.
        const history = boundPracticeHistory(state.practiceHistory);
        if (history) stats.practiceHistory = history;

        await Promise.all([profile.save(), stats.save()]);

        const gameState = await buildFullState(userId);
        res.json({ success: true, message: 'State saved successfully', data: gameState });
    } catch (error) {
        logger.error('Error in saveState:', error);
        next(error);
    }
};

// ⛔ DEPRECATED & KHÓA: endpoint này từng cho client set thẳng tiền tệ → lỗ cheat.
// Tài nguyên giờ server-authoritative (cấp qua /practice/submit, /shop/purchase,
// quest/achievement/checkin claim...). Không client nào còn gọi route này.
exports.updateResources = async (req, res) => {
    return res.status(403).json({
        success: false,
        message: 'Endpoint đã bị khóa: tài nguyên do server quản lý (server-authoritative).',
    });
};

// ⛔ DEPRECATED & KHÓA: client set counter tổng (correct/games...) → cheat tiến độ
// nhiệm vụ (quest đọc các counter này để cấp thưởng). Counter giờ do server cập
// nhật qua /practice/submit. Riêng wordsLearned/wordsMastered đi qua POST /state.
exports.updateProgress = async (req, res) => {
    return res.status(403).json({
        success: false,
        message: 'Endpoint đã bị khóa: tiến độ do server cập nhật (server-authoritative).',
    });
};

// ⛔ DEPRECATED & KHÓA: cho client tự cộng XP tùy ý → lỗ cheat. XP giờ chỉ được
// cấp bởi /practice/submit (có cap mỗi câu) và các luồng thưởng server khác.
exports.addXp = async (req, res) => {
    return res.status(403).json({
        success: false,
        message: 'Endpoint đã bị khóa: XP do server cấp (server-authoritative).',
    });
};

exports.unlockAchievement = async (req, res, next) => {
    try {
        const { achievementId } = req.body;
        if (!achievementId) return res.status(400).json({ success: false, message: 'Achievement ID is required' });

        const userId = req.user.id;

        // Check already unlocked
        const existing = await UserAchievement.findOne({ userId, code: achievementId });
        if (existing) return res.status(400).json({ success: false, message: 'Achievement already unlocked' });

        // Find definition
        const def = await AchievementDefinition.findOne({ code: achievementId, isActive: true });
        if (!def) return res.status(404).json({ success: false, message: 'Achievement not found' });

        const stats = await UserStats.findOne({ userId });
        if (!stats) return res.status(404).json({ success: false, message: 'User not found' });
        const profile = await UserProfile.findOne({ userId });

        // ── KIỂM ĐIỀU KIỆN TRƯỚC KHI PHÁT THƯỞNG ────────────────────────────
        // Trước đây bước này KHÔNG tồn tại: server chỉ kiểm "đã mở chưa" và "mã
        // có thật không" rồi cộng tiền. Điều kiện ("đạt level 50", "streak 7
        // ngày") chỉ được chép vào state để hiển thị, không ai so nó với gì.
        const check = checkAchievementCondition(def, stats, profile);
        if (!check.ok) {
            if (check.reason.startsWith('unsupported_condition') || check.reason === 'invalid_condition_value') {
                // Không tra được điều kiện thì TỪ CHỐI, không cho qua. Cho qua là
                // quay lại đúng bug cũ, chỉ khác là im lặng hơn.
                logger.error('Thành tích cấu hình sai, không kiểm được điều kiện:', {
                    code: achievementId, reason: check.reason,
                });
                return res.status(409).json({
                    success: false,
                    message: 'Thành tích này đang cấu hình sai. Vui lòng báo quản trị viên.',
                });
            }
            return res.status(403).json({
                success: false,
                message: `Chưa đạt điều kiện (${check.current}/${def.conditionValue}).`,
                progress: { current: check.current, required: def.conditionValue },
            });
        }

        // Grant rewards
        if (def.rewardCoins) stats.coins += def.rewardCoins;
        // Cộng XP có áp lên cấp ngay (giữ level khớp xp) — xem awardXp.
        if (def.rewardXp && profile) awardXp(profile, stats, def.rewardXp);
        if (def.rewardGems) stats.gems += def.rewardGems;
        const achName = `Thành tích: ${def.name}`;
        if (def.rewardCoins) logTxn(userId, { type: 'achievement', direction: 'in', name: achName, amount: def.rewardCoins, currency: 'coins', balanceAfter: stats.coins });
        if (def.rewardGems)  logTxn(userId, { type: 'achievement', direction: 'in', name: achName, amount: def.rewardGems, currency: 'gems', balanceAfter: stats.gems });

        // Vật phẩm thưởng (từ catalog) → cấp vào túi đồ + kèm icon/ảnh cho popup.
        const rewardItems = Array.isArray(def.rewardItems) ? def.rewardItems : [];
        const itemsDetailed = [];
        if (rewardItems.length) {
            const ids = rewardItems.map(i => i && i.itemId).filter(Boolean);
            const idefs = await ItemDefinition.find({ itemId: { $in: ids } }).select('itemId name icon image').lean();
            const dmap = new Map(idefs.map(d => [d.itemId, d]));
            for (const it of rewardItems) {
                if (!it || !it.itemId) continue;
                const qty = Number(it.quantity) || 1;
                await Inventory.grant(userId, it.itemId, qty, { source: 'achievement' });
                const d = dmap.get(it.itemId) || {};
                itemsDetailed.push({ itemId: it.itemId, quantity: qty, name: d.name || it.itemId, icon: d.icon || '', image: d.image || '' });
            }
        }

        const [userAch] = await Promise.all([
            UserAchievement.create({
                userId,
                achievementDefinitionId: def._id,
                code: achievementId,
                claimedRewards: { xp: def.rewardXp, coins: def.rewardCoins, gems: def.rewardGems, items: rewardItems },
            }),
            stats.save(),
            profile?.save(),
            Notification.create({
                userId,
                type: 'achievement',
                title: `Thành tích mới: ${def.name}`,
                body: def.description,
                data: { achievementCode: achievementId },
            }),
        ]);

        res.json({
            success: true,
            message: 'Achievement unlocked!',
            data: {
                achievement: { id: def.code, name: def.name, description: def.description, icon: def.icon },
                rewards: { coins: def.rewardCoins, xp: def.rewardXp, gems: def.rewardGems, items: itemsDetailed },
            },
        });
    } catch (error) {
        logger.error('Error in unlockAchievement:', error);
        next(error);
    }
};

exports.updateQuests = async (req, res, next) => {
    try {
        const { daily, lastResetDate } = req.body;
        const userId = req.user.id;

        if (daily && Array.isArray(daily)) {
            const today = new Date().toISOString().split('T')[0];
            const completed = daily.filter(q => q.completed);
            await UserDailyQuest.findOneAndUpdate(
                { userId, date: today },
                { $set: { quests: daily, totalCompleted: completed.length } },
                { upsert: true }
            );
        }

        res.json({ success: true, message: 'Quests updated successfully', data: { daily, lastResetDate } });
    } catch (error) {
        logger.error('Error in updateQuests:', error);
        next(error);
    }
};

// applyShopEffect moved to services/shopEffects.js (Phase 3).

// purchaseItem moved to controllers/shopController.js (P4).
