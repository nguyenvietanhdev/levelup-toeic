const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const { nhanLoi } = require('../services/errorTaxonomy');
const { chuanHoaMuc } = require('../services/aiLevel');
const UserStats = require('../models/UserStats');
const UserProfile = require('../models/UserProfile');
const { fetchWords, faceOf, chonTrongDanhSach } = require('../services/chonTu');
const { openConversation, replyTurn, goiYKhung, moTaVai, NHOM_TINH_HUONG } = require('../services/conversationAi');
const { layNham } = require('../services/nhamDiemYeu');
const { chonDang } = require('../services/dangBai');
const { chuanHoaBoTieuChi, gradeConversation } = require('../services/conversationGrader');
const { matchWords, collectUsed, collectAiUsed } = require('../utils/wordMatch');
const { awardXp } = require('../utils/userStateHelper');
const { isVipActive } = require('../utils/energyCosts');
const logger = require('../utils/logger');
const roles = require('../services/aiRoles');

/**
 * Chế độ HỘI THOẠI — luyện dùng lại từ vựng vừa học.
 *
 * Ba endpoint: mở phiên · đáp một lượt · chốt điểm.
 *
 * Nguyên tắc xuyên suốt (theo CLAUDE.md): mọi con số ăn tiền đều do SERVER
 * quyết. Client tự chấm để tô sáng cho mượt, nhưng `usedWords` — thứ quy ra
 * XP/xu — được tính lại từ `turns` đã lưu sau MỖI lượt.
 */

/** Năng lượng cho một phiên hội thoại. */
const ENERGY_COST = 15;

/** Số từ mục tiêu mỗi phiên. Nhiều hơn thì người học không kịp dùng trong ~10 lượt. */
const TARGET_SIZE = 12;

/** Trần lượt. Chặn phiên chạy vô hạn — mỗi lượt là một lần gọi AI có phí. */
const MAX_TURNS = 24;

/** Thưởng cho mỗi từ dùng được. */
const XP_PER_WORD = 8;
const COINS_PER_WORD = 3;

/** Độ dài tối đa một câu người học gửi lên. Chặn nhồi prompt và tốn token. */
const MAX_REPLY_LEN = 500;

/**
 * Chọn 12 từ mục tiêu, ƯU TIÊN từ người học đang sai (tỉ lệ 1 = mọi từ sai đứng
 * trước). Lấy bộ từ, đọc mặt từ (`zh`/`en`) và so với WrongWord đều ở service chung
 * `chonTu` — dùng chung với Nghe, Đọc, Dịch.
 */
async function pickTargets({ userId, words }) {
    return chonTrongDanhSach({ userId, mat: words.map(faceOf), soLuong: TARGET_SIZE, tiLeYeu: 1 });
}

/** Trừ năng lượng nguyên tử, VIP miễn trừ. Trả `null` nếu không đủ. */
async function chargeEnergy(userId) {
    const current = await UserStats.findOne({ userId });
    if (!current) return { error: 'notfound' };
    if (isVipActive(current)) return { energyRemaining: current.energy, vip: true };

    // Điều kiện `$gte` nằm TRONG câu truy vấn: kiểm tra rồi mới trừ ở hai bước
    // riêng thì hai request song song cùng vượt qua bước kiểm và trừ hai lần.
    const updated = await UserStats.findOneAndUpdate(
        { userId, energy: { $gte: ENERGY_COST } },
        { $inc: { energy: -ENERGY_COST }, $set: { lastEnergyUpdate: new Date() } },
        { new: true }
    );
    if (!updated) return { error: 'energy', currentEnergy: current.energy ?? 0 };
    return { energyRemaining: updated.energy, vip: false };
}

/**
 * @desc    Mở một phiên hội thoại mới
 * @route   POST /api/conversation/start
 */
exports.start = async (req, res, next) => {
    try {
        // Bối cảnh: client gửi MÃ (`office`, `travel`...), server đổi thành câu
        // mô tả. Mã lạ hoặc thiếu thì ra chung chung, không lỗi.
        let topic = moTaVai(req.body.context);

        /**
         * Đề · Part · ngôn ngữ do SERVER tự đọc từ hồ sơ, KHÔNG nhận từ client.
         *
         * Trước đây client phải gom ba thứ này rồi gửi lên. Mỗi thứ là một chỗ
         * để đoán sai hình dạng dữ liệu, và cả ba đều đã sai thật:
         *   · `source` — client gửi cả OBJECT đề `{id,name,source}` → CastError
         *     → errorHandler dịch thành 404, lỗi hiện ra chẳng liên quan bệnh;
         *   · `part`   — đọc từ `settings.selectedPart`, mà trường đó bị Mongoose
         *     strip nên luôn rỗng;
         *   · `lang`   — client tự suy từ localStorage.
         *
         * Server đọc thẳng hồ sơ thì không còn ranh giới nào để đoán sai. Client
         * chỉ việc bấm nút.
         *
         * Vẫn CHO client ghi đè (`req.body.source`) — nhưng phải là chuỗi. Cần
         * cho việc thử nghiệm và cho lối "luyện bộ khác bộ đang chọn" về sau.
         */
        const profile = await UserProfile.findOne({ userId: req.user.id })
            .select('settings').lean();
        const st = profile?.settings || {};

        const asString = (v) => (typeof v === 'string' ? v.trim() : '');
        const source = asString(req.body.source) || asString(st.selectedSource);
        const part = asString(req.body.part) || asString(st.selectedPart);
        const lang = req.body.lang === 'zh' || req.body.lang === 'en'
            ? req.body.lang
            : (st.vocabLang === 'zh' ? 'zh' : 'en');
        // Kho song ngữ Trung–Anh: hội thoại vẫn nói tiếng Anh (`lang`), nhưng bộ
        // tiêu chí được chọn theo cả hai ngôn ngữ (`track`).
        const track = st.vocabLang === 'bi' ? 'bi' : lang;

        if (!source) {
            // Nói rõ PHẢI LÀM GÌ, không chỉ "thiếu source": người dùng không
            // biết "source" là gì, họ chỉ biết mình đã chọn đề hay chưa.
            return res.status(400).json({
                success: false,
                message: 'Chưa chọn đề từ vựng. Hãy chọn đề rồi thử lại.',
                needTopic: true,
            });
        }
        // (Không cần kiểm `lang` nữa — phép chuẩn hoá ở trên đã đảm bảo nó chỉ
        // có thể là 'en' hoặc 'zh'.)

        // Bộ lọc độ khó ở thanh trên (`levelFilter`, vd A1–A2 hay HSK1–2) phải được
        // tôn trọng khi chọn từ mục tiêu. Không lọc thì người học chọn "Dễ" mà vẫn
        // bị hỏi từ C1. Rỗng/không đặt = lấy hết.
        const levelFilter = Array.isArray(st.levelFilter) && st.levelFilter.length
            ? new Set(st.levelFilter)
            : null;
        const tatCa = await fetchWords({ email: req.user.email, source, part, lang });
        const words = levelFilter
            ? tatCa.filter((w) => levelFilter.has(w.level))
            : tatCa;
        if (words.length < 4) {
            // Dưới 4 từ thì hội thoại không có gì để nhắm — báo rõ thay vì mở
            // một phiên rỗng rồi để người dùng tự đoán vì sao không ăn điểm.
            return res.status(400).json({
                success: false,
                message: levelFilter
                    ? `Với mức độ đang chọn chỉ có ${words.length} từ, không đủ để luyện hội thoại (cần ít nhất 4 từ). Đổi mức độ ở thanh trên.`
                    : 'Bộ từ này quá ít từ để luyện hội thoại (cần ít nhất 4 từ)',
                wordCount: words.length,
            });
        }

        const targetWords = await pickTargets({ userId: req.user.id, words });

        // Trừ năng lượng TRƯỚC khi gọi AI: gọi AI trước thì người không đủ năng
        // lượng vẫn làm ta tốn tiền token.
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

        const level = chuanHoaMuc(req.body.level);
        // Bộ tiêu chí phải hợp với ngôn ngữ của phiên (HSK chỉ cho tiếng Trung).
        const rubric = chuanHoaBoTieuChi(req.body.rubric, track);
        // Vai của Part (AI đề xuất hoặc người dùng tự viết) THAY vai đã chọn ở cột
        // trái. Không có vai cho Part này thì giữ vai đã chọn. Lỗi đọc vai không
        // được làm hỏng việc mở phiên.
        const vaiPart = await roles.layVai({
            userId: req.user.id, email: req.user.email, source, part, lang: track,
        }).catch((err) => {
            logger.warn('Không đọc được vai của Part', { error: err?.message });
            return { vai: null };
        });
        if (vaiPart.vai) topic = vaiPart.vai;

        // Tình huống người học chọn hoặc tự nhập (null = AI tự dựng như trước). Ghép với vai.
        const tinhHuong = chonDang(NHOM_TINH_HUONG, { dang: req.body.dang, tuChon: req.body.tuChon });
        // Hội thoại GIỌNG NÓI (AI gửi tin nhắn thoại, người học trả lời bằng ghi âm)
        // hay Chat chữ. Chỉ khác cách AI viết câu; chấm điểm giữ nguyên.
        const voice = req.body.voice === true;
        // Lỗi ngữ pháp lặp lại trong hồ sơ: AI thỉnh thoảng hỏi câu cần đúng cấu
        // trúc đó. Người học tắt được (`nhamYeu: false`); lỗi đọc hồ sơ → bỏ qua.
        const nham = req.body.nhamYeu === false ? [] : await layNham(req.user.id, lang);
        const nhamKeys = nham.map((n) => n.key);
        const ai = await openConversation({ lang, topic, targetWords, userId: req.user.id, level, tinhHuong, voice, nham: nhamKeys });
        if (!ai.success) {
            // AI lỗi thì HOÀN năng lượng — người dùng không được gì mà vẫn mất
            // tiền là lỗi tệ nhất trong nhóm này.
            if (!charge.vip) {
                await UserStats.updateOne({ userId: req.user.id }, { $inc: { energy: ENERGY_COST } });
            }
            logger.error('Conversation start: AI failed', ai.error);
            return res.status(503).json({
                success: false,
                message: 'Không tạo được hội thoại, đã hoàn năng lượng. Thử lại sau.',
            });
        }

        // Chỉ MỘT phiên dở được mời làm tiếp (cùng kiểu Chat / Giọng nói): mở phiên mới
        // là bỏ các phiên dở cũ. Không xoá — vẫn tự hết hạn như trước.
        await Conversation.updateMany(
            { userId: req.user.id, status: 'active', voice: voice ? true : { $ne: true } },
            { $set: { status: 'abandoned' } },
        );

        const convo = await Conversation.create({
            userId: req.user.id,
            source, part, lang, topic, scenario: ai.scenario || '', rubric, track,
            strictGrammar: req.body.strictGrammar === true,
            tinhHuong: tinhHuong ? tinhHuong.vi : '',
            voice,
            nhamLoi: nhamKeys,
            targetWords,
            level,
            turns: [{ role: 'npc', content: ai.content }],
        });
        convo.aiUsedWords = collectAiUsed(convo.turns, convo.targetWords, convo.lang);
        if (convo.aiUsedWords.length) await convo.save();

        res.json({
            success: true,
            data: {
                id: convo._id,
                targetWords: convo.targetWords,
                turns: convo.turns,
                usedWords: [],
                aiUsedWords: convo.aiUsedWords,
                nhamLoi: nham,
                energyRemaining: charge.energyRemaining,
                vip: !!charge.vip,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Người học đáp một lượt, AI đáp lại
 * @route   POST /api/conversation/:id/reply
 */
exports.reply = async (req, res, next) => {
    try {
        const { message } = req.body;
        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, message: 'Thiếu nội dung' });
        }
        const text = String(message).slice(0, MAX_REPLY_LEN);

        // Lọc theo CẢ `userId`: thiếu nó là ai biết id cũng đọc/ghi được phiên
        // của người khác.
        const convo = await Conversation.findOne({ _id: req.params.id, userId: req.user.id });
        if (!convo) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hội thoại' });
        }
        if (convo.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Hội thoại đã kết thúc' });
        }
        if (convo.turns.length >= MAX_TURNS) {
            return res.status(400).json({
                success: false, message: 'Hội thoại đã đủ dài, hãy kết thúc để nhận thưởng',
                maxTurns: MAX_TURNS,
            });
        }

        // Chấm NGAY lượt này, và tính lại TOÀN BỘ `usedWords` từ `turns`.
        // Không cộng dồn từ client: client gửi gì cũng được, còn đây là con số
        // quy ra XP/xu.
        const matched = matchWords(text, convo.targetWords, convo.lang);
        convo.turns.push({ role: 'user', content: text, matched });

        const ai = await replyTurn({
            lang: convo.lang,
            topic: convo.topic,
            scenario: convo.scenario,
            targetWords: convo.targetWords,
            usedWords: [...convo.usedWords, ...(convo.aiUsedWords || [])],
            turns: convo.turns,
            userId: req.user.id,
            // Đọc lại từ phiên, không nhận từ client: client khai mức khác
            // giữa chừng là đổi độ khó sau khi đã bắt đầu.
            level: convo.level,
            voice: convo.voice === true,
            // Chốt lúc mở phiên: hồ sơ đổi giữa chừng cũng không đổi hướng hội thoại.
            nham: convo.nhamLoi || [],
        });

        if (ai.success) {
            convo.turns.push({ role: 'npc', content: ai.content });
        }

        convo.usedWords = collectUsed(convo.turns, convo.targetWords, convo.lang);
        convo.aiUsedWords = collectAiUsed(convo.turns, convo.targetWords, convo.lang);
        // Người dùng còn hoạt động → đẩy hạn tự xoá ra xa.
        convo.expiresAt = new Date(
            Date.now() + Conversation.ABANDONED_TTL_DAYS * 24 * 60 * 60 * 1000
        );
        await convo.save();

        res.json({
            success: true,
            data: {
                // Lượt vừa thêm của người học + (nếu có) câu đáp của AI.
                matched,
                npcReply: ai.success ? ai.content : null,
                // AI lỗi thì KHÔNG chặn: câu của người học đã được chấm và lưu,
                // họ chỉ mất một câu đáp. Báo cờ để giao diện nói rõ.
                aiFailed: !ai.success,
                usedWords: convo.usedWords,
                aiUsedWords: convo.aiUsedWords,
                turnCount: convo.turns.length,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Chốt hội thoại, cộng thưởng (một lần duy nhất)
 * @route   POST /api/conversation/:id/finish
 */
exports.finish = async (req, res, next) => {
    try {
        const convo = await Conversation.findOne({ _id: req.params.id, userId: req.user.id });
        if (!convo) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hội thoại' });
        }
        if (convo.reward.claimed) {
            // Trả 200 với cờ, KHÔNG phải lỗi: gọi lại do mạng chập là chuyện
            // thường, báo lỗi ở đó làm người dùng tưởng mất thưởng.
            return res.json({
                success: true,
                data: {
                    alreadyClaimed: true,
                    reward: convo.reward,
                    usedWords: convo.usedWords,
                    feedback: convo.feedback ?? null,
                },
            });
        }

        // Tính LẠI từ `turns` lần cuối — không tin `usedWords` đã lưu, vì đây là
        // bước ra tiền.
        const used = collectUsed(convo.turns, convo.targetWords, convo.lang);
        const xp = used.length * XP_PER_WORD;
        const coins = used.length * COINS_PER_WORD;

        const [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId: req.user.id }),
            UserStats.findOne({ userId: req.user.id }),
        ]);
        if (!profile || !stats) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const lvl = awardXp(profile, stats, xp);
        stats.coins += coins;

        // Chấm theo bộ tiêu chí đã chọn. Lỗi hoặc không chấm được thì `feedback`
        // là null — phần thưởng từ vựng vẫn được nhận, không phụ thuộc vào AI.
        const feedback = await gradeConversation({
            rubric: convo.rubric,
            lang: convo.lang,
            track: convo.track,
            level: convo.level,
            nghiemNguPhap: convo.strictGrammar === true,
            turns: convo.turns.map((t) => ({ role: t.role, content: t.content })),
            userId: req.user.id,
        });

        convo.usedWords = used;
        convo.aiUsedWords = collectAiUsed(convo.turns, convo.targetWords, convo.lang);
        convo.status = 'done';
        convo.reward = { xp, coins, claimed: true };
        convo.feedback = feedback;
        // Phiên đã xong là LỊCH SỬ học tập — bỏ hạn tự xoá để người dùng xem lại.
        convo.expiresAt = null;

        await Promise.all([profile.save(), stats.save(), convo.save()]);

        res.json({
            success: true,
            data: {
                usedWords: used,
                aiUsedWords: convo.aiUsedWords,
                totalTargets: convo.targetWords.length,
                reward: { xp, coins },
                feedback,
                leveledUp: lvl.leveledUp,
                newLevel: lvl.newLevel,
                coinsBalance: stats.coins,
            },
        });
    } catch (error) {
        next(error);
    }
};

// Xuất hằng số cho test và cho giao diện hiển thị giá.
/**
 * @desc    Danh sách phiên đã kết thúc của CHÍNH người dùng (mới nhất trước).
 * @route   GET /api/conversation/history
 *
 * Không trả lời thoại trong danh sách — chỉ đủ để nhận diện phiên và xem điểm.
 * Chi tiết đầy đủ ở `detail`.
 */
exports.history = async (req, res, next) => {
    try {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const rows = await Conversation.find({ userId: req.user.id, status: 'done' })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('topic scenario rubric level track lang voice reward usedWords targetWords createdAt feedback.overall feedback.muc feedback.dat feedback.label feedback.nguong')
            .lean();
        res.json({
            success: true,
            data: rows.map((c) => ({
                id: String(c._id),
                topic: c.topic || '',
                scenario: c.scenario || '',
                rubric: c.rubric || 'giaotiep',
                level: c.level,
                track: c.track || 'en',
                voice: c.voice === true,
                createdAt: c.createdAt,
                usedCount: (c.usedWords || []).length,
                totalTargets: (c.targetWords || []).length,
                reward: c.reward || null,
                feedback: c.feedback?.label ? {
                    label: c.feedback.label,
                    overall: c.feedback.overall,
                    muc: c.feedback.muc,
                    dat: c.feedback.dat,
                    nguong: c.feedback.nguong,
                } : null,
            })),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Xem lại một phiên đã kết thúc (lời thoại, tình huống, kết quả chấm).
 * @route   GET /api/conversation/:id
 *
 * Phiên đang chạy không mở được ở đây — để tránh nhầm với trạng thái giữa chừng.
 * Chỉ chủ phiên mới xem được.
 */
exports.detail = async (req, res, next) => {
    try {
        const convo = await Conversation.findOne({ _id: req.params.id, userId: req.user.id, status: 'done' }).lean();
        if (!convo) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy phiên này' });
        }
        res.json({
            success: true,
            data: {
                id: String(convo._id),
                topic: convo.topic || '',
                scenario: convo.scenario || '',
                voice: convo.voice === true,
                rubric: convo.rubric || 'giaotiep',
                level: convo.level,
                track: convo.track || 'en',
                lang: convo.lang,
                createdAt: convo.createdAt,
                targetWords: convo.targetWords || [],
                usedWords: convo.usedWords || [],
                aiUsedWords: convo.aiUsedWords || [],
                reward: convo.reward || null,
                turns: (convo.turns || []).map((t) => ({
                    role: t.role,
                    content: t.content,
                    matched: t.matched || [],
                })),
                feedback: convo.feedback || null,
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.ENERGY_COST = ENERGY_COST;
exports.TARGET_SIZE = TARGET_SIZE;
/** Số lần gọi AI tạo khung gợi ý tối đa mỗi phiên — chặn bấm liên tục để đốt token. */
const MAX_GOI_Y_AI = 8;

/**
 * @desc    Khung câu trả lời cho câu NPC cuối (gọi AI khi người học bấm Gợi ý)
 * @route   POST /api/conversation/:id/hint
 *
 * Lượt NPC đã có khung thì trả lại luôn, KHÔNG gọi AI và không tính lượt.
 * Hết lượt gợi ý AI thì trả 429 — client vẫn còn khung dựng bằng luật.
 */
exports.hint = async (req, res, next) => {
    try {
        const convo = await Conversation.findOne({ _id: req.params.id, userId: req.user.id });
        if (!convo) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hội thoại' });
        }
        if (convo.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Hội thoại đã kết thúc' });
        }
        const idx = convo.turns.length - 1;
        const cuoi = convo.turns[idx];
        if (!cuoi || cuoi.role !== 'npc') {
            return res.status(400).json({ success: false, message: 'Chưa có câu AI để gợi ý' });
        }
        const conLai = () => Math.max(0, MAX_GOI_Y_AI - (convo.hintCount || 0));
        if (Array.isArray(cuoi.khung) && cuoi.khung.length) {
            return res.json({ success: true, data: { khung: cuoi.khung, conLai: conLai(), cached: true } });
        }
        if ((convo.hintCount || 0) >= MAX_GOI_Y_AI) {
            return res.status(429).json({
                success: false, limit: true,
                message: `Đã dùng hết ${MAX_GOI_Y_AI} lượt gợi ý AI của phiên này.`,
            });
        }

        const ai = await goiYKhung({
            lang: convo.lang,
            topic: convo.topic,
            scenario: convo.scenario,
            cauAI: cuoi.content,
            words: (convo.targetWords || []).filter((w) => !(convo.usedWords || []).includes(w)).slice(0, 6),
            level: convo.level,
            userId: req.user.id,
        });
        if (!ai.success) {
            logger.error('Conversation hint: AI failed', ai.error);
            return res.status(503).json({ success: false, message: 'Chưa tạo được gợi ý, thử lại sau.' });
        }

        convo.turns[idx].khung = ai.khung;
        convo.markModified('turns');
        convo.hintCount = (convo.hintCount || 0) + 1;
        await convo.save();
        res.json({ success: true, data: { khung: ai.khung, conLai: conLai(), cached: false } });
    } catch (error) {
        next(error);
    }
};

exports.MAX_GOI_Y_AI = MAX_GOI_Y_AI;
exports.MAX_TURNS = MAX_TURNS;
exports.XP_PER_WORD = XP_PER_WORD;
exports.COINS_PER_WORD = COINS_PER_WORD;

/**
 * @desc    Phiên hội thoại ĐANG DỞ gần nhất (để vào lại nói tiếp, không trừ năng
 *          lượng và không gọi AI mở phiên lần nữa). `?voice=1` cho Hội thoại giọng nói.
 * @route   GET /api/conversation/dang-do
 */
exports.dangDo = async (req, res, next) => {
    try {
        const voice = req.query.voice === '1' || req.query.voice === 'true';
        const convo = await Conversation.findOne({
            userId: req.user.id,
            status: 'active',
            voice: voice ? true : { $ne: true },
            'turns.0': { $exists: true },
        }).sort({ updatedAt: -1 }).lean();
        if (!convo) return res.json({ success: true, data: null });

        const nham = (convo.nhamLoi || []).map((key) => ({ key, vi: nhanLoi(key) }));
        res.json({
            success: true,
            data: {
                id: String(convo._id),
                topic: convo.topic || '',
                scenario: convo.scenario || '',
                tinhHuong: convo.tinhHuong || '',
                level: convo.level,
                rubric: convo.rubric,
                targetWords: convo.targetWords || [],
                turns: (convo.turns || []).map((t) => ({ role: t.role, content: t.content, matched: t.matched || [] })),
                usedWords: convo.usedWords || [],
                aiUsedWords: convo.aiUsedWords || [],
                nhamLoi: nham,
                capNhat: convo.updatedAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Bỏ phiên đang dở (người học chọn "Bỏ, bắt đầu phiên mới").
 * @route   POST /api/conversation/:id/bo
 */
exports.bo = async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Mã phiên không hợp lệ' });
        }
        await Conversation.updateOne(
            { _id: req.params.id, userId: req.user.id, status: 'active' },
            { $set: { status: 'abandoned' } },
        );
        res.json({ success: true, data: { daBo: true } });
    } catch (error) {
        next(error);
    }
};
