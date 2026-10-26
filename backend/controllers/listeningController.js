/**
 * Nghe với AI (TTS). Ba thao tác:
 *   · start  — lấy từ mục tiêu, trừ năng lượng, AI viết đoạn nghe, lưu phiên.
 *   · audio  — phát âm thanh đoạn nghe (không trả chữ).
 *   · grade  — chấm bài người học gõ lại, cộng thưởng một lần.
 */
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const ListeningSession = require('../models/ListeningSession');
const { sinhDoanNghe, chamNghe, NHOM_DANG_NGHE, GIONG_THEO_NGON_NGU } = require('../services/listeningAi');
const { chonDang } = require('../services/dangBai');
const { tongHop } = require('../services/ttsEngine');
const { chonTu } = require('../services/chonTu');
const { awardXp } = require('../utils/userStateHelper');
const { isVipActive } = require('../utils/energyCosts');
const { chuanHoaMuc } = require('../services/aiLevel');
const logger = require('../utils/logger');
const { luuDe, xoaNhap } = require('../services/baiNhap');

/** Năng lượng mỗi lượt nghe (thấp hơn hội thoại vì không có lượt đáp qua lại). */
const ENERGY_COST_NGHE = 10;
/** Số từ mục tiêu đưa vào đoạn nghe. */
const TU_MUC_TIEU = 8;
/** Giọng đọc mặc định (tiếng Anh) — phiên tiếng Trung dùng `GIONG_THEO_NGON_NGU.zh`. */
const GIONG_NGHE = GIONG_THEO_NGON_NGU.en;
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


/**
 * @desc    Mở một lượt nghe: AI viết đoạn nghe từ bộ từ đang học.
 * @route   POST /api/listening/start
 */
exports.start = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const profile = await UserProfile.findOne({ userId }).select('settings').lean();
        const st = profile?.settings || {};

        // Tiếng Anh hoặc tiếng Trung (kho song ngữ 'bi' nghe bằng tiếng Anh).
        const lang = st.vocabLang === 'zh' ? 'zh' : 'en';
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
        // Chọn từ ở service chung: đúng mặt từ, gồm từ vựng riêng, lọc mức độ, và
        // tối đa NỬA số từ là từ đang sai — nghe lại đúng chỗ còn yếu.
        const { tu: targetWords, tongTrongBo } = await chonTu({
            userId, email: req.user.email, settings: st, lang, soLuong: TU_MUC_TIEU, tiLeYeu: 0.5,
        });
        const tuKho = { length: tongTrongBo };
        if (tuKho.length < 4) {
            return res.status(400).json({
                success: false,
                message: levelFilter
                    ? `Với mức độ đang chọn chỉ có ${tuKho.length} từ, không đủ để nghe (cần ít nhất 4 từ). Đổi mức độ ở thanh trên.`
                    : `Bộ từ này quá ít từ để nghe (cần ít nhất 4 từ).`,
            });
        }
        // Dạng nghe người học chọn hoặc tự nhập; null = Ngẫu nhiên.
        const chon = chonDang(NHOM_DANG_NGHE, { dang: req.body.dang, tuChon: req.body.tuChon });

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
            passage = await sinhDoanNghe({ targetWords, level, userId, chon, lang });
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
            userId, source, part, level, lang, targetWords, passage,
            dang: chon ? chon.key : '', dangVi: chon ? chon.vi : '',
        });
        const de = {
            id: String(doc._id),
            level,
            lang,
            dang: chon ? chon.key : '',
            dangVi: chon ? chon.vi : '',
            totalTargets: targetWords.length,
        };
        // Lưu thành BÀI NHÁP: năng lượng đã trừ lúc bắt đầu, thoát giữa chừng mà vào lại
        // phải lấy bài mới là mất cả năng lượng lẫn một lượt AI. Không có lời thoại —
        // chỉ mã phiên; âm thanh vẫn phát từ `/:id/audio`.
        await luuDe(userId, 'nghe', lang, de);
        res.json({ success: true, data: { ...de, energyRemaining: charge.energyRemaining } });
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
        // Giọng theo ngôn ngữ của PHIÊN (phiên cũ không có `lang` → tiếng Anh).
        const giong = GIONG_THEO_NGON_NGU[phien.lang] || GIONG_NGHE;
        // `duPhong`: Edge hỏng thì dùng Google — năng lượng đã trừ, bài nghe phải phát được.
        const { buffer, nguon } = await tongHop(giong, phien.passage, kepTocDo(req.query.rate), { duPhong: true });
        res.setHeader('X-TTS-Nguon', nguon || '');
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
        // Đã nộp → bài nháp hết việc (kể cả khi lần nộp song song kia mới là lần được thưởng).
        await xoaNhap(userId, 'nghe', phien.lang === 'zh' ? 'zh' : 'en');
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

// ── Lịch sử Nghe với AI ──────────────────────────────────────────────────
const mongoose = require('mongoose');

/**
 * @desc    Các lượt nghe ĐÃ CHẤM, mới nhất trước
 * @route   GET /api/listening/history
 *
 * Chỉ lượt đã chấm: lượt còn mở mà trả đoạn gốc là lộ đáp án của bài đang nghe.
 */
exports.history = async (req, res, next) => {
    try {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const rows = await ListeningSession.find({ userId: req.user.id, status: 'done' })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('level lang dang dangVi targetWords score createdAt')
            .lean();
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Xem lại một lượt nghe đã chấm: đoạn gốc, bài đã gõ, từ thiếu / thừa
 * @route   GET /api/listening/:id
 *
 * Từ thiếu/thừa tính LẠI từ đoạn gốc và bài gõ (`chamNghe`) — không phải lưu thêm,
 * và luôn khớp với cách chấm hiện tại.
 */
exports.detail = async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Mã bài không hợp lệ' });
        }
        const doc = await ListeningSession.findOne({ _id: req.params.id, userId: req.user.id, status: 'done' })
            .select('+passage -userId -__v').lean();
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bài nghe này' });
        }
        res.json({ success: true, data: { ...doc, ketQua: chamNghe(doc.passage, doc.typed || '') } });
    } catch (error) {
        next(error);
    }
};
