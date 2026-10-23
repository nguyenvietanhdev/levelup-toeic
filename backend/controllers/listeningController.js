/**
 * Nghe với AI (TTS). Ba thao tác:
 *   · start  — lấy từ mục tiêu, trừ năng lượng, AI viết đoạn nghe, lưu phiên.
 *   · audio  — phát âm thanh đoạn nghe (không trả chữ).
 *   · grade  — chấm bài người học gõ lại, cộng thưởng một lần.
 */
const Vocabulary = require('../models/Vocabulary');
const UserUpload = require('../models/UserUpload');
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const ListeningSession = require('../models/ListeningSession');
const { sinhDoanNghe, chamNghe } = require('../services/listeningAi');
const { tongHop } = require('../services/ttsEngine');
const { awardXp } = require('../utils/userStateHelper');
const { isVipActive } = require('../utils/energyCosts');
const { chuanHoaMuc } = require('../services/aiLevel');
const logger = require('../utils/logger');

/** Năng lượng mỗi lượt nghe (thấp hơn hội thoại vì không có lượt đáp qua lại). */
const ENERGY_COST_NGHE = 10;
/** Số từ mục tiêu đưa vào đoạn nghe. */
const TU_MUC_TIEU = 8;
/** Giọng đọc cố định cho đoạn nghe: tiếng Anh, giọng nữ tự nhiên. */
const GIONG_NGHE = 'en-US-AriaNeural';
/** Tốc độ đọc cho phép (kẹp lại để không bị đọc quá nhanh hoặc quá chậm). */
function kepTocDo(raw) {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return 0.9;
    return Math.min(1.2, Math.max(0.6, v));
}

/** Trừ năng lượng có điều kiện, một lần. VIP không trừ. */
async function truNangLuong(userId) {
    const current = await UserStats.findOne({ userId });
    if (!current) return { error: 'notfound' };
    if (isVipActive(current)) return { vip: true, energyRemaining: current.energy };
    const updated = await UserStats.findOneAndUpdate(
        { userId, energy: { $gte: ENERGY_COST_NGHE } },
        { $inc: { energy: -ENERGY_COST_NGHE }, $set: { lastEnergyUpdate: new Date() } },
        { new: true },
    );
    if (!updated) return { error: 'energy', currentEnergy: current.energy ?? 0 };
    return { vip: false, energyRemaining: updated.energy };
}

/** Từ tiếng Anh của Part (kho chung + kho riêng), lọc theo bộ lọc độ khó nếu có. */
async function layTuMucTieu({ email, source, part, levelFilter }) {
    const filter = { source, part };
    const [shared, mine] = await Promise.all([
        Vocabulary.find(filter).select('en level').lean(),
        email ? UserUpload.find({ ...filter, ownerEmail: email, lang: 'en' }).select('en level').lean() : [],
    ]);
    const ds = [...shared, ...mine]
        .filter((w) => typeof w.en === 'string' && w.en.trim())
        .filter((w) => !levelFilter || levelFilter.has(w.level));
    const seen = new Set();
    const tu = [];
    for (const w of ds) {
        const key = w.en.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tu.push(w.en.trim());
    }
    return tu;
}

/** Chọn ngẫu nhiên tối đa n từ (mỗi lượt một bộ khác nhau). */
function chonNgauNhien(list, n) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
}

/**
 * @desc    Mở một lượt nghe: AI viết đoạn nghe từ bộ từ đang học.
 * @route   POST /api/listening/start
 */
exports.start = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const profile = await UserProfile.findOne({ userId }).select('settings').lean();
        const st = profile?.settings || {};

        // Nghe bằng TTS hiện chỉ có tiếng Anh: đoạn TTS và cách chấm theo từ đều dựa vào chữ Latin.
        if (st.vocabLang === 'zh') {
            return res.status(400).json({ success: false, message: 'Nghe với AI hiện chỉ có tiếng Anh.' });
        }
        const source = typeof st.selectedSource === 'string' ? st.selectedSource.trim().toLowerCase() : '';
        const part = typeof st.selectedPart === 'string' ? st.selectedPart.trim() : '';
        if (!source) {
            return res.status(400).json({
                success: false, needTopic: true,
                message: 'Chưa chọn đề từ vựng. Hãy chọn đề rồi thử lại.',
            });
        }

        const level = chuanHoaMuc(req.body.level);
        const levelFilter = Array.isArray(st.levelFilter) && st.levelFilter.length
            ? new Set(st.levelFilter) : null;
        const tuKho = await layTuMucTieu({ email: req.user.email, source, part, levelFilter });
        if (tuKho.length < 4) {
            return res.status(400).json({
                success: false,
                message: levelFilter
                    ? `Với mức độ đang chọn chỉ có ${tuKho.length} từ, không đủ để nghe (cần ít nhất 4 từ). Đổi mức độ ở thanh trên.`
                    : `Bộ từ này quá ít từ để nghe (cần ít nhất 4 từ).`,
            });
        }
        const targetWords = chonNgauNhien(tuKho, TU_MUC_TIEU);

        // Trừ năng lượng TRƯỚC khi gọi AI; AI lỗi thì hoàn lại.
        const charge = await truNangLuong(userId);
        if (charge.error === 'notfound') {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (charge.error === 'energy') {
            return res.status(400).json({
                success: false, message: 'Không đủ năng lượng',
                energyNeeded: ENERGY_COST_NGHE, currentEnergy: charge.currentEnergy,
            });
        }

        let passage;
        try {
            passage = await sinhDoanNghe({ targetWords, level, userId });
        } catch (err) {
            if (!charge.vip) {
                await UserStats.updateOne({ userId }, { $inc: { energy: ENERGY_COST_NGHE } });
            }
            logger.error('Listening start: AI failed', { error: err?.message });
            return res.status(503).json({
                success: false,
                message: 'Chưa tạo được đoạn nghe, đã hoàn năng lượng. Thử lại sau.',
            });
        }

        const doc = await ListeningSession.create({
            userId, source, part, level, targetWords, passage,
        });
        res.json({
            success: true,
            data: {
                id: String(doc._id),
                level,
                totalTargets: targetWords.length,
                energyRemaining: charge.energyRemaining,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Âm thanh của một lượt nghe. Không cần đăng nhập vì id là ngẫu nhiên và
 *          chỉ phát âm thanh — không trả chữ.
 * @route   GET /api/listening/:id/audio?rate=0.9
 */
exports.audio = async (req, res, next) => {
    try {
        const phien = await ListeningSession.findById(req.params.id).select('+passage').lean();
        if (!phien) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy lượt nghe này' });
        }
        const { buffer } = await tongHop(GIONG_NGHE, phien.passage, kepTocDo(req.query.rate));
        if (!buffer || !buffer.length) {
            return res.status(500).json({ success: false, message: 'Không tạo được âm thanh' });
        }
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buffer);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Chấm bài người học gõ lại. Thưởng cộng MỘT lần.
 * @route   POST /api/listening/:id/grade
 */
exports.grade = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const typed = typeof req.body.typed === 'string' ? req.body.typed.trim().slice(0, 1000) : '';
        if (!typed) {
            return res.status(400).json({ success: false, message: 'Hãy gõ lại những gì bạn nghe được.' });
        }

        const phien = await ListeningSession.findOne({ _id: req.params.id, userId }).select('+passage').lean();
        if (!phien) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy lượt nghe này' });
        }
        // Đã chấm rồi: chấm lại đúng BÀI ĐÃ NỘP (không phải bài gõ mới) và KHÔNG cộng thưởng lần nữa.
        if (phien.status === 'done') {
            const cu = chamNghe(phien.passage, phien.typed);
            return res.json({
                success: true,
                data: { ...cu, score: phien.score, reward: phien.reward, alreadyClaimed: true,
                    passage: phien.passage },
            });
        }

        const ketQua = chamNghe(phien.passage, typed);

        const xp = Math.round((ketQua.score / 100) * 30);
        const coins = Math.round((ketQua.score / 100) * 10);
        // Chiếm phiên bằng điều kiện `status: 'open'` — hai request song song chỉ một cái được thưởng.
        const dat = await ListeningSession.findOneAndUpdate(
            { _id: phien._id, userId, status: 'open' },
            { $set: { status: 'done', typed, score: ketQua.score, reward: { xp, coins, claimed: true } } },
            { new: true },
        );
        if (!dat) {
            return res.json({ success: true, data: { ...ketQua, alreadyClaimed: true, passage: phien.passage } });
        }

        const [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId }),
            UserStats.findOne({ userId }),
        ]);
        let lvl = { leveledUp: false, newLevel: null };
        if (profile && stats) {
            lvl = awardXp(profile, stats, xp);
            stats.coins += coins;
            await Promise.all([profile.save(), stats.save()]);
        }

        res.json({
            success: true,
            data: {
                ...ketQua,
                reward: { xp, coins },
                leveledUp: lvl.leveledUp,
                newLevel: lvl.newLevel,
                passage: phien.passage,
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.ENERGY_COST_NGHE = ENERGY_COST_NGHE;
exports.TU_MUC_TIEU = TU_MUC_TIEU;
exports.GIONG_NGHE = GIONG_NGHE;
