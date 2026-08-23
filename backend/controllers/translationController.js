const Translation = require('../models/Translation');
const UserStats = require('../models/UserStats');
const UserProfile = require('../models/UserProfile');
const { generatePassage, gradeTranslation, limitsFor, countUnits, mucKho } =
    require('../services/translationGrader');
const { awardXp } = require('../utils/userStateHelper');
const { isVipActive } = require('../utils/energyCosts');
const Essay = require('../models/Essay');
const { thongKe, chuanHoaLoai } = require('../services/errorTaxonomy');
const logger = require('../utils/logger');

/**
 * Luyện DỊCH — đọc một đoạn tiếng Việt, viết lại bằng tiếng Anh (hoặc Trung).
 *
 * Hai endpoint: xin đoạn · nộp bản dịch. Cùng hình dạng với Viết luận vì cùng
 * một bài toán (AI sinh đề → người học làm → AI chấm), và đi chệch khỏi khuôn
 * đó chỉ tạo thêm một cách làm nữa để nhớ.
 *
 * Ngôn ngữ ĐÍCH lấy từ `settings.vocabLang` của hồ sơ, KHÔNG nhận từ client —
 * đúng bài học đã rút ở Hội thoại và Viết luận: mỗi tham số client tự gom là
 * một chỗ đoán sai hình dạng dữ liệu. Riêng ở đây còn nghĩa là bản dịch tiếng
 * Trung bị chấm bằng tiêu chí tiếng Anh, tức điểm hoàn toàn vô nghĩa.
 */

/** Năng lượng cho một lần chấm. Rẻ hơn viết luận vì bài ngắn hơn hẳn. */
const ENERGY_COST = 15;

/** Thưởng: cố định + thêm theo điểm, để dịch tốt được nhiều hơn. */
const XP_BASE = 20;
const XP_PER_BAND = 8;
const COINS_PER_BAND = 4;

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
 * @desc    Xin một đoạn văn tiếng Việt để dịch
 * @route   POST /api/translation/passage
 *
 * KHÔNG trừ năng lượng, như `essay.prompt`: xin đề mà mất năng lượng thì người
 * dùng ngại bấm, và chi phí sinh đề rất nhỏ so với lần chấm.
 */
exports.passage = async (req, res, next) => {
    try {
        const profile = await UserProfile.findOne({ userId: req.user.id })
            .select('settings').lean();
        const lang = profile?.settings?.vocabLang === 'zh' ? 'zh' : 'en';

        // Từ vựng do client gửi lên — đây là những từ người học vừa luyện ở đề
        // đang chọn, mà server không biết được (bộ từ nằm ở phía client sau khi
        // đã lọc theo Part và cấp độ).
        //
        // An toàn vì `generatePassage` tự lọc và cắt còn 8 từ trước khi ghép vào
        // prompt: không tin dữ liệu này, chỉ dùng nó làm gợi ý.
        const words = Array.isArray(req.body.words) ? req.body.words : [];
        const level = mucKho(req.body.level);

        const ai = await generatePassage({ tuVung: words, userId: req.user.id, lang, level });
        if (!ai.success) {
            logger.error('Translation passage: AI failed', ai.error);
            return res.status(503).json({
                success: false,
                message: 'Chưa lấy được đoạn văn, thử lại sau.',
            });
        }

        const { min } = limitsFor(lang);
        res.json({
            success: true,
            data: {
                passage: ai.passage,
                topic: ai.topic,
                words: ai.words,
                level: ai.level,
                lang,
                // `min` là số TỪ với `en`, số CHỮ HÁN với `zh` — `lang` cho
                // client biết dùng đơn vị nào để hiển thị.
                minUnits: min,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Nộp bản dịch và chấm
 * @route   POST /api/translation/grade
 */
exports.grade = async (req, res, next) => {
    try {
        const passage = typeof req.body.passage === 'string' ? req.body.passage.trim() : '';
        const translation = typeof req.body.translation === 'string'
            ? req.body.translation.trim() : '';

        if (!passage) {
            return res.status(400).json({ success: false, message: 'Thiếu đoạn văn gốc' });
        }
        if (!translation) {
            return res.status(400).json({ success: false, message: 'Bản dịch trống' });
        }

        const settingsOnly = await UserProfile.findOne({ userId: req.user.id })
            .select('settings').lean();
        const lang = settingsOnly?.settings?.vocabLang === 'zh' ? 'zh' : 'en';

        // Tiếng Trung đếm CHỮ HÁN: không có khoảng trắng giữa các từ nên đếm
        // theo từ thì cả bài ra đúng 1 và người học không bao giờ nộp được.
        const { min } = limitsFor(lang);
        const unit = lang === 'zh' ? 'chữ' : 'từ';
        const unitCount = countUnits(translation, lang);

        if (unitCount < min) {
            // Chặn TRƯỚC khi trừ năng lượng và gọi AI: bản dịch mấy chữ thì
            // không có gì để chấm, mà vẫn tốn token và năng lượng của người ta.
            return res.status(400).json({
                success: false,
                message: `Bản dịch cần ít nhất ${min} ${unit}. Bài của bạn có ${unitCount} ${unit}.`,
                unitCount,
                minUnits: min,
                lang,
                tooShort: true,
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

        const ai = await gradeTranslation({ passage, translation, userId: req.user.id, lang });
        if (!ai.success) {
            // HOÀN năng lượng: dịch xong cả đoạn mà không được chấm, lại còn
            // mất năng lượng, là lỗi tệ nhất có thể xảy ra ở đây.
            if (!charge.vip) {
                await UserStats.updateOne(
                    { userId: req.user.id }, { $inc: { energy: ENERGY_COST } }
                );
            }
            logger.error('Translation grade: AI failed', ai.error);
            return res.status(503).json({
                success: false,
                message: 'Chưa chấm được bài, đã hoàn năng lượng. Thử lại sau.',
            });
        }

        // Thưởng theo điểm do SERVER tính (đã kẹp về thang hợp lệ trong
        // `gradeTranslation`) — client không khai được.
        const xp = Math.round(XP_BASE + ai.overall * XP_PER_BAND);
        const coins = Math.round(ai.overall * COINS_PER_BAND);

        const [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId: req.user.id }),
            UserStats.findOne({ userId: req.user.id }),
        ]);
        if (!profile || !stats) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const lvl = awardXp(profile, stats, xp);
        stats.coins += coins;

        const doc = await Translation.create({
            userId: req.user.id,
            passage,
            topic: typeof req.body.topic === 'string' ? req.body.topic : '',
            words: Array.isArray(req.body.words)
                ? req.body.words.map((w) => String(w || '')).filter(Boolean).slice(0, 8)
                : [],
            level: mucKho(req.body.level),
            translation,
            unitCount,
            lang,
            scores: ai.scores,
            overall: ai.overall,
            reference: ai.reference,
            notes: ai.notes,
            summary: ai.summary,
            energySpent: charge.vip ? 0 : ENERGY_COST,
        });

        await Promise.all([profile.save(), stats.save()]);

        res.json({
            success: true,
            data: {
                id: doc._id,
                unitCount,
                scores: ai.scores,
                overall: ai.overall,
                reference: ai.reference,
                notes: ai.notes,
                summary: ai.summary,
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
 * @desc    Danh sách bài đã dịch — để đối chiếu tiến bộ
 * @route   GET /api/translation/history
 */
exports.history = async (req, res, next) => {
    try {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const rows = await Translation.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(limit)
            // KHÔNG trả `translation`/`reference`/`notes`: danh sách chỉ cần
            // điểm và đoạn đề. Trả cả bài là mỗi lần mở màn tải về hàng chục KB.
            .select('passage topic overall scores unitCount level createdAt')
            .lean();
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

exports.ENERGY_COST = ENERGY_COST;
exports.XP_BASE = XP_BASE;

/**
 * @desc    Nhật ký lỗi ngữ pháp — gom từ MỌI bài đã chấm
 * @route   GET /api/translation/mistakes
 *
 * Gom cả bài Dịch lẫn bài Viết luận: cùng một người viết thì sai cùng một kiểu,
 * chia đôi thống kê theo chế độ chỉ làm mỗi bên ít dữ liệu hơn mà không nói
 * thêm được gì.
 *
 * Đây là thứ ChatGPT không làm được cho người học: nó không nhớ họ đã sai gì
 * tháng trước.
 */
exports.mistakes = async (req, res, next) => {
    try {
        const userId = req.user.id || req.user._id;
        // Cửa sổ thời gian: mặc định 90 ngày. Lỗi từ nửa năm trước có thể đã sửa
        // được rồi, tính vào thống kê là chẩn đoán theo dữ liệu đã cũ.
        const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 90));
        const tu = new Date(Date.now() - days * 86400000);

        const [dich, luan] = await Promise.all([
            Translation.find({ userId, createdAt: { $gte: tu } })
                .select('notes createdAt').lean(),
            Essay.find({ userId, createdAt: { $gte: tu } })
                .select('issues createdAt').lean(),
        ]);

        // Gộp thành một danh sách phẳng, giữ nguyên chỗ nó đến từ đâu để về sau
        // trả lời được "lỗi này gặp ở bài nào".
        const all = [
            ...dich.flatMap((d) => (d.notes || []).map((n) => ({ ...n, nguon: 'translation', at: d.createdAt }))),
            ...luan.flatMap((e) => (e.issues || []).map((n) => ({ ...n, nguon: 'essay', at: e.createdAt }))),
        ];

        const stats = thongKe(all);
        // Ví dụ THẬT của người học cho mỗi nhóm, tối đa 3: "bạn sai mạo từ 14
        // lần" không dạy được gì nếu không thấy lại chính câu mình đã viết.
        const viDu = {};
        for (const s of stats) {
            viDu[s.key] = all
                .filter((x) => chuanHoaLoai(x.loai ?? x.type) === s.key)
                .slice(-3)
                .map((x) => ({
                    quote: String(x.quote || ''),
                    issue: String(x.issue || ''),
                    fix: String(x.better || x.fix || ''),
                }));
        }

        res.json({
            success: true,
            data: { days, total: all.length, stats, examples: viDu },
        });
    } catch (error) {
        next(error);
    }
};
