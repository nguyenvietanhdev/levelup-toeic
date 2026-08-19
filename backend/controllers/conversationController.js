const Conversation = require('../models/Conversation');
const UserStats = require('../models/UserStats');
const UserProfile = require('../models/UserProfile');
const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');
const UserUpload = require('../models/UserUpload');
const WrongWord = require('../models/WrongWord');
const { openConversation, replyTurn } = require('../services/conversationAi');
const { matchWords, collectUsed } = require('../utils/wordMatch');
const { awardXp } = require('../utils/userStateHelper');
const { isVipActive } = require('../utils/energyCosts');
const logger = require('../utils/logger');

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
 * Lấy từ vựng của (source, part).
 *
 * Phải dò CẢ HAI nơi: kho chung (`vocabularies` / `vocabularies_zh`, do admin
 * quản) và kho riêng của người dùng (`user_upload`). Cùng một `source` có thể
 * nằm ở một trong hai — chỉ dò một chỗ là mất hẳn nửa dữ liệu, mà không lỗi nào
 * báo: danh sách rỗng trông y như "part này chưa có từ".
 */
async function fetchWords({ userId, source, part, lang }) {
    const filter = { source };
    if (part) filter.part = part;

    const SharedModel = lang === 'zh' ? VocabularyZh : Vocabulary;
    const [shared, mine] = await Promise.all([
        // `zh` phải nằm trong `select`: kho tiếng Trung lưu chữ Hán ở trường
        // `zh`, còn `en` để RỖNG. Chỉ lấy `en` thì danh sách từ mục tiêu rỗng
        // trơn — mà hội thoại vẫn mở bình thường, nên trông như AI hoạt động
        // đúng trong khi người học không thể ăn điểm nào.
        SharedModel.find(filter).select('en zh vn').lean(),
        UserUpload.find({ ...filter, userId, lang }).select('en zh vn').lean(),
    ]);

    return [...shared, ...mine];
}

/**
 * Mặt từ dùng để so khớp.
 *
 * Hai kho đặt tên khác nhau: kho tiếng Anh dùng `en`, kho tiếng Trung dùng `zh`
 * (và bỏ trống `en`). Lấy sai trường thì không lỗi nào báo, chỉ là danh sách
 * mục tiêu rỗng.
 */
function faceOf(w) {
    if (!w) return '';
    const zh = typeof w.zh === 'string' ? w.zh.trim() : '';
    const en = typeof w.en === 'string' ? w.en.trim() : '';
    // Ưu tiên `zh` khi có: bản ghi tiếng Trung nào cũng có `zh`, còn `en` có thể
    // là chuỗi rỗng hoặc phiên âm.
    return zh || en;
}

/**
 * Chọn từ mục tiêu, ƯU TIÊN từ người học đã từng sai.
 *
 * Đây là chỗ tính năng có giá trị hơn một chatbot thường: app biết người học
 * yếu từ nào (`WrongWord`), nên hội thoại nhắm đúng chỗ đó thay vì ôn tràn lan.
 */
async function pickTargets({ userId, words }) {
    // KHỬ TRÙNG theo mặt chữ. Kho tiếng Trung có những chữ đa âm được lưu thành
    // NHIỀU bản ghi khác nhau — `地`, `还`, `干` trong hsk1 mỗi chữ hai bản ghi
    // (khác pinyin, khác nghĩa). Không khử thì cùng một chữ hiện hai lần trong
    // bảng "Từ cần dùng", React cảnh báo trùng `key`, và tệ hơn: người học dùng
    // chữ đó một lần nhưng chỉ một ô sáng lên, tưởng mình chưa dùng.
    const all = [...new Set(words.map(faceOf).filter(Boolean))];
    if (all.length <= TARGET_SIZE) return all;

    // WrongWord cũng có thể lưu mặt từ ở `en` HOẶC `zh` tuỳ kho gốc — dùng
    // chung `faceOf` để hai bên so khớp được với nhau.
    const wrong = await WrongWord.find({ userId }).select('en zh').lean();
    const wrongSet = new Set(wrong.map(faceOf).filter(Boolean));

    const weak = all.filter((w) => wrongSet.has(w));
    const rest = all.filter((w) => !wrongSet.has(w));

    // Trộn phần còn lại để mỗi phiên một khác — cùng một Part mà lần nào cũng
    // đúng 12 từ đầu thì luyện vài lần là nhàm.
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    return [...weak, ...rest].slice(0, TARGET_SIZE);
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
        const { topic = '' } = req.body;

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

        const words = await fetchWords({ userId: req.user.id, source, part, lang });
        if (words.length < 4) {
            // Dưới 4 từ thì hội thoại không có gì để nhắm — báo rõ thay vì mở
            // một phiên rỗng rồi để người dùng tự đoán vì sao không ăn điểm.
            return res.status(400).json({
                success: false,
                message: 'Bộ từ này quá ít từ để luyện hội thoại (cần ít nhất 4 từ)',
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

        const ai = await openConversation({ lang, topic, targetWords, userId: req.user.id });
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

        const convo = await Conversation.create({
            userId: req.user.id,
            source, part, lang, topic,
            targetWords,
            turns: [{ role: 'npc', content: ai.content }],
        });

        res.json({
            success: true,
            data: {
                id: convo._id,
                targetWords: convo.targetWords,
                turns: convo.turns,
                usedWords: [],
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
            targetWords: convo.targetWords,
            usedWords: convo.usedWords,
            turns: convo.turns,
            userId: req.user.id,
        });

        if (ai.success) {
            convo.turns.push({ role: 'npc', content: ai.content });
        }

        convo.usedWords = collectUsed(convo.turns, convo.targetWords, convo.lang);
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
                data: { alreadyClaimed: true, reward: convo.reward, usedWords: convo.usedWords },
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

        convo.usedWords = used;
        convo.status = 'done';
        convo.reward = { xp, coins, claimed: true };
        // Phiên đã xong là LỊCH SỬ học tập — bỏ hạn tự xoá để người dùng xem lại.
        convo.expiresAt = null;

        await Promise.all([profile.save(), stats.save(), convo.save()]);

        res.json({
            success: true,
            data: {
                usedWords: used,
                totalTargets: convo.targetWords.length,
                reward: { xp, coins },
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
exports.ENERGY_COST = ENERGY_COST;
exports.TARGET_SIZE = TARGET_SIZE;
exports.MAX_TURNS = MAX_TURNS;
exports.XP_PER_WORD = XP_PER_WORD;
exports.COINS_PER_WORD = COINS_PER_WORD;
