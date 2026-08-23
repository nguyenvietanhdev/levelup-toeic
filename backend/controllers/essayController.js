const Essay = require('../models/Essay');
const { chuanHoaMuc } = require('../services/aiLevel');
const UserStats = require('../models/UserStats');
const UserProfile = require('../models/UserProfile');
const { generatePrompt, gradeEssay, countUnits, limitsFor } =
    require('../services/essayGrader');
const { awardXp } = require('../utils/userStateHelper');
const { isVipActive } = require('../utils/energyCosts');
const logger = require('../utils/logger');

/**
 * Luyện VIẾT LUẬN — IELTS Task 2 (tiếng Anh) hoặc HSK 书写 (tiếng Trung).
 *
 * Hai endpoint: xin đề · nộp bài.
 *
 * Chuẩn chấm chọn theo `settings.vocabLang` của hồ sơ, KHÔNG theo tham số client
 * gửi lên. Học từ chế độ Hội thoại: client gửi càng ít càng tốt — năm lỗi liên
 * tiếp ở đó đều là "đoán hình dạng dữ liệu ở ranh giới". Ở đây còn một lý do
 * nữa: client khai `lang: 'en'` cho bài tiếng Trung là bài bị chấm bằng tiêu chí
 * IELTS, tức điểm hoàn toàn vô nghĩa.
 */

/** Năng lượng cho một lần chấm. */
const ENERGY_COST = 20;

/** Thưởng: cố định + thêm theo band, để viết tốt được nhiều hơn. */
const XP_BASE = 30;
const XP_PER_BAND = 10;      // × band tổng
const COINS_PER_BAND = 5;

/** Trừ năng lượng nguyên tử, VIP miễn trừ. */
async function chargeEnergy(userId) {
    const current = await UserStats.findOne({ userId });
    if (!current) return { error: 'notfound' };
    if (isVipActive(current)) return { energyRemaining: current.energy, vip: true };

    // Điều kiện `$gte` nằm TRONG truy vấn: kiểm rồi mới trừ ở hai bước thì hai
    // request song song cùng qua bước kiểm và trừ hai lần.
    const updated = await UserStats.findOneAndUpdate(
        { userId, energy: { $gte: ENERGY_COST } },
        { $inc: { energy: -ENERGY_COST }, $set: { lastEnergyUpdate: new Date() } },
        { new: true }
    );
    if (!updated) return { error: 'energy', currentEnergy: current.energy ?? 0 };
    return { energyRemaining: updated.energy, vip: false };
}

/**
 * @desc    Xin một đề Task 2
 * @route   POST /api/essay/prompt
 *
 * KHÔNG trừ năng lượng: xin đề mà mất năng lượng thì người dùng ngại bấm, và
 * họ có thể muốn xem vài đề trước khi chọn viết cái nào. Chi phí một lần sinh
 * đề rất nhỏ so với lần chấm.
 */
exports.prompt = async (req, res, next) => {
    try {
        // Chủ đề lấy từ ĐỀ TỪ VỰNG đang chọn — đề bài khi đó dùng đúng vốn từ
        // người học vừa luyện. Đây là thứ ChatGPT không làm được: nó không biết
        // người học đang học bộ nào.
        const profile = await UserProfile.findOne({ userId: req.user.id })
            .select('settings').lean();
        const topicHint = typeof profile?.settings?.selectedSource === 'string'
            ? profile.settings.selectedSource
            : '';
        // Ngôn ngữ lấy từ HỒ SƠ, client không gửi lên — cùng lý do với `topicHint`:
        // mỗi tham số client tự gom là một chỗ đoán sai hình dạng dữ liệu.
        // Người đang học tiếng Trung mà nhận đề IELTS tiếng Anh thì chế độ này
        // vô dụng với họ.
        const lang = profile?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
        const { min } = limitsFor(lang);

        const level = chuanHoaMuc(req.body.level);
        const ai = await generatePrompt({ topicHint, userId: req.user.id, lang, level });
        if (!ai.success) {
            logger.error('Essay prompt: AI failed', ai.error);
            return res.status(503).json({
                success: false,
                message: 'Chưa lấy được đề, thử lại sau.',
            });
        }

        res.json({
            success: true,
            // `minWords` giữ nguyên TÊN cho tương thích, nhưng với tiếng Trung
            // nó là số CHỮ HÁN — `lang` cho client biết đơn vị nào để hiển thị.
            data: { prompt: ai.prompt, type: ai.type, topicHint, lang, minWords: min, level },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Nộp bài và chấm
 * @route   POST /api/essay/grade
 */
exports.grade = async (req, res, next) => {
    try {
        const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
        const essay = typeof req.body.essay === 'string' ? req.body.essay.trim() : '';

        if (!prompt) {
            return res.status(400).json({ success: false, message: 'Thiếu đề bài' });
        }
        if (!essay) {
            return res.status(400).json({ success: false, message: 'Bài viết trống' });
        }

        // Ngôn ngữ đọc từ HỒ SƠ, không nhận từ client: client khai `lang: 'en'`
        // cho bài tiếng Trung là bài bị chấm bằng tiêu chí IELTS.
        //
        // Truy vấn `.lean()` riêng chứ không dùng lại `profile` ở dưới: cái đó
        // nằm SAU khi đã trừ năng lượng và gọi AI, mà ngưỡng độ dài phải kiểm
        // TRƯỚC — bài quá ngắn thì không được mất năng lượng.
        const settingsOnly = await UserProfile.findOne({ userId: req.user.id })
            .select('settings').lean();
        const lang = settingsOnly?.settings?.vocabLang === 'zh' ? 'zh' : 'en';

        // Đơn vị đếm khác nhau: tiếng Trung đếm CHỮ HÁN vì không có khoảng trắng
        // giữa các từ — đếm theo từ thì cả bài luận ra đúng 1 và người học không
        // bao giờ nộp được bài.
        const { min, max } = limitsFor(lang);
        const unit = lang === 'zh' ? 'chữ' : 'từ';
        const wordCount = countUnits(essay, lang);

        if (wordCount < min) {
            // Chặn TRƯỚC khi trừ năng lượng và gọi AI: bài dưới ngưỡng thì
            // trong kỳ thi thật đã bị trừ điểm, chấm cũng không có ý nghĩa.
            return res.status(400).json({
                success: false,
                message: `Bài cần ít nhất ${min} ${unit}. Bài của bạn có ${wordCount} ${unit}.`,
                wordCount,
                minWords: min,
                lang,
                tooShort: true,
            });
        }
        if (wordCount > max) {
            return res.status(400).json({
                success: false,
                message: `Bài quá dài (${wordCount} ${unit}). Tối đa ${max} ${unit}.`,
                wordCount,
                maxWords: max,
                lang,
            });
        }

        // Trừ năng lượng TRƯỚC khi gọi AI — gọi trước thì người không đủ năng
        // lượng vẫn làm ta tốn token.
        const charge = await chargeEnergy(req.user.id);
        if (charge.error === 'notfound') {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (charge.error === 'energy') {
            return res.status(400).json({
                success: false, message: 'Không đủ năng lượng',
                energyNeeded: ENERGY_COST, currentEnergy: charge.currentEnergy,
            });
        }

        const ai = await gradeEssay({ prompt, essay, userId: req.user.id, lang });
        if (!ai.success) {
            // HOÀN năng lượng — người dùng viết 250 từ mà không được chấm lại
            // còn mất năng lượng là lỗi tệ nhất ở đây.
            if (!charge.vip) {
                await UserStats.updateOne(
                    { userId: req.user.id }, { $inc: { energy: ENERGY_COST } }
                );
            }
            logger.error('Essay grade: AI failed', ai.error);
            return res.status(503).json({
                success: false,
                message: 'Chưa chấm được bài, đã hoàn năng lượng. Thử lại sau.',
            });
        }

        const r = ai.result;
        // Thưởng theo band: viết tốt được nhiều hơn. Band do SERVER tính (đã kẹp
        // về thang hợp lệ trong `gradeEssay`), client không khai được.
        const xp = Math.round(XP_BASE + r.overall * XP_PER_BAND);
        const coins = Math.round(r.overall * COINS_PER_BAND);

        const [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId: req.user.id }),
            UserStats.findOne({ userId: req.user.id }),
        ]);
        if (!profile || !stats) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const lvl = awardXp(profile, stats, xp);
        stats.coins += coins;

        const doc = await Essay.create({
            userId: req.user.id,
            prompt,
            promptType: typeof req.body.promptType === 'string' ? req.body.promptType : '',
            topicHint: typeof req.body.topicHint === 'string' ? req.body.topicHint : '',
            essay,
            wordCount,
            lang,
            scores: r.scores,
            overall: r.overall,
            comments: r.comments,
            issues: r.errors,
            strengths: r.strengths,
            improved: r.improved,
            // Thưởng cộng NGAY tại đây nên đánh dấu đã nhận luôn — không có
            // endpoint "nhận thưởng" riêng để gọi lại hai lần.
            reward: { xp, coins, claimed: true },
        });

        await Promise.all([profile.save(), stats.save()]);

        res.json({
            success: true,
            data: {
                id: doc._id,
                wordCount,
                scores: r.scores,
                overall: r.overall,
                comments: r.comments,
                issues: r.errors,
                strengths: r.strengths,
                improved: r.improved,
                reward: { xp, coins },
                leveledUp: lvl.leveledUp,
                newLevel: lvl.newLevel,
                energyRemaining: charge.energyRemaining,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Danh sách bài đã viết — để đối chiếu tiến bộ
 * @route   GET /api/essay/history
 */
exports.history = async (req, res, next) => {
    try {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const rows = await Essay.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(limit)
            // KHÔNG trả `essay`/`errors`/`improved`: danh sách chỉ cần band và
            // đề bài. Trả cả bài viết là mỗi lần mở màn tải về hàng chục KB.
            .select('prompt overall scores wordCount createdAt')
            .lean();
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

exports.ENERGY_COST = ENERGY_COST;
exports.XP_BASE = XP_BASE;
