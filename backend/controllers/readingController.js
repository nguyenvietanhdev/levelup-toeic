const crypto = require('crypto');
const ReadingAttempt = require('../models/ReadingAttempt');
const UserStats = require('../models/UserStats');
const UserProfile = require('../models/UserProfile');
const { generateReading, gradeReading, mucKho } = require('../services/readingGrader');
const { awardXp } = require('../utils/userStateHelper');
const { isVipActive } = require('../utils/energyCosts');
const logger = require('../utils/logger');

/**
 * Luyện ĐỌC HIỂU dạng TOEIC Part 7.
 *
 * Hai endpoint: xin bài · nộp đáp án.
 *
 * KHÁC hai chế độ AI kia ở một điểm cốt lõi: đề có ĐÁP ÁN ĐÚNG, mà đáp án thì
 * phải giấu khỏi client cho tới lúc nộp — gửi kèm đề là người dùng mở DevTools
 * đọc được ngay. Nên server GIỮ đề trong bộ nhớ và chỉ trả về phần hỏi.
 *
 * Giữ ở RAM chứ không ghi DB: đề chỉ sống trong một lượt làm bài, ghi xuống rồi
 * xoá là thêm hai lượt I/O cho mỗi bài mà không được gì. Đổi lại phải chấp nhận
 * mất đề đang làm dở khi server khởi động lại — hiếm, và hậu quả chỉ là xin bài
 * mới, không mất năng lượng vì chưa trừ.
 */

/** Năng lượng cho một lượt. Bằng Dịch: cùng độ dài một lượt làm. */
const ENERGY_COST = 15;

/** Thưởng theo tỉ lệ đúng. */
const XP_BASE = 15;
const XP_PER_RATIO = 25;      // × tỉ lệ đúng (0..1)
const COINS_PER_RATIO = 12;

/**
 * Đề đang mở, khoá theo `readingId`.
 *
 * `Map` có thứ tự chèn nên dọn cái cũ nhất là `keys().next()`. Giới hạn cứng để
 * một người bấm "bài khác" trăm lần không làm phình bộ nhớ vô hạn.
 */
const DE_MO = new Map();
const TOI_DA = 500;
const HAN_MS = 60 * 60 * 1000;   // 1 giờ — quá lâu thì coi như bỏ dở

/** Bỏ đề hết hạn và cắt bớt nếu vượt trần. */
function donDe() {
    const now = Date.now();
    for (const [id, v] of DE_MO) {
        if (now - v.at > HAN_MS) DE_MO.delete(id);
    }
    while (DE_MO.size > TOI_DA) {
        DE_MO.delete(DE_MO.keys().next().value);
    }
}

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
 * @desc    Xin một bài đọc kèm câu hỏi
 * @route   POST /api/reading/passage
 *
 * KHÔNG trừ năng lượng ở đây — trừ khi NỘP. Người dùng có thể xin bài rồi thấy
 * quá dài mà bỏ; tính tiền cho việc đó là phạt một quyết định hợp lý.
 */
exports.passage = async (req, res, next) => {
    try {
        const words = Array.isArray(req.body.words) ? req.body.words : [];
        const level = mucKho(req.body.level);

        const ai = await generateReading({
            tuVung: words, userId: req.user.id, level, dang: req.body.dang,
        });
        if (!ai.success) {
            logger.error('Reading passage: AI failed', ai.error);
            return res.status(503).json({
                success: false,
                message: 'Chưa lấy được bài đọc, thử lại sau.',
            });
        }

        donDe();
        const readingId = crypto.randomUUID();
        DE_MO.set(readingId, {
            userId: String(req.user.id),
            at: Date.now(),
            data: ai,
        });

        res.json({
            success: true,
            data: {
                readingId,
                title: ai.title,
                passage: ai.passage,
                dang: ai.dang,
                dangVi: ai.dangVi,
                level: ai.level,
                words: ai.words,
                // CHỈ đề và lựa chọn — không có `answer`, không có `explain`.
                // Gửi kèm là người dùng mở DevTools thấy đáp án ngay.
                questions: ai.questions.map((q) => ({
                    question: q.question,
                    options: q.options,
                })),
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Nộp đáp án và chấm
 * @route   POST /api/reading/grade
 */
exports.grade = async (req, res, next) => {
    try {
        const readingId = String(req.body.readingId || '');
        const luu = DE_MO.get(readingId);

        if (!luu) {
            // Hết hạn hoặc server vừa khởi động lại. Chưa trừ năng lượng nên
            // người dùng chỉ mất công, không mất gì khác.
            return res.status(410).json({
                success: false,
                expired: true,
                message: 'Bài đọc đã hết hạn. Lấy bài mới để làm lại.',
            });
        }
        // Đề của người khác: `readingId` là UUID nên đoán được là chuyện gần
        // như không thể, nhưng kiểm vẫn rẻ hơn là tin.
        if (luu.userId !== String(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Không có quyền' });
        }

        const traLoi = Array.isArray(req.body.answers) ? req.body.answers : [];

        // Trừ năng lượng TRƯỚC khi chấm, nhưng SAU khi đã chắc đề còn hiệu lực:
        // trừ rồi mới phát hiện đề hết hạn là mất năng lượng oan.
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

        const r = gradeReading(luu.data.questions, traLoi);

        // Xoá đề NGAY sau khi chấm: để lại thì nộp lần hai ăn thưởng lần nữa
        // trên cùng một bài.
        DE_MO.delete(readingId);

        const xp = Math.round(XP_BASE + r.ratio * XP_PER_RATIO);
        const coins = Math.round(r.ratio * COINS_PER_RATIO);

        const [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId: req.user.id }),
            UserStats.findOne({ userId: req.user.id }),
        ]);
        if (!profile || !stats) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const lvl = awardXp(profile, stats, xp);
        stats.coins += coins;

        const doc = await ReadingAttempt.create({
            userId: req.user.id,
            title: luu.data.title,
            passage: luu.data.passage,
            dang: luu.data.dang,
            level: luu.data.level,
            words: luu.data.words,
            // Ghép đề với kết quả: lưu cả `options` để mở lại lịch sử còn thấy
            // mình đã chọn gì trong bốn phương án nào.
            questions: r.details.map((d, i) => ({
                question: d.question,
                options: luu.data.questions[i]?.options || [],
                answer: d.answer,
                chose: d.chose,
                correct: d.correct,
                explain: d.explain,
            })),
            correct: r.correct,
            total: r.total,
            energySpent: charge.vip ? 0 : ENERGY_COST,
        });

        await Promise.all([profile.save(), stats.save()]);

        res.json({
            success: true,
            data: {
                id: doc._id,
                correct: r.correct,
                total: r.total,
                details: r.details,
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
 * @desc    Lịch sử làm bài — để đối chiếu tiến bộ
 * @route   GET /api/reading/history
 */
exports.history = async (req, res, next) => {
    try {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const rows = await ReadingAttempt.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(limit)
            // KHÔNG trả `passage`/`questions`: danh sách chỉ cần điểm và tiêu
            // đề. Trả cả bài đọc là mỗi lần mở màn tải về hàng chục KB.
            .select('title dang level correct total createdAt')
            .lean();
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

exports.ENERGY_COST = ENERGY_COST;
// Xuất cho test — kiểm dọn dẹp mà không phải dựng cả HTTP.
exports._DE_MO = DE_MO;
exports._donDe = donDe;
