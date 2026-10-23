/**
 * Gợi ý dạng bài HỢP với bộ từ của Part (nhóm "Hợp bộ từ này" trên màn chọn).
 *
 * Vì sao cần: kho dạng bài dùng chung mọi Part, nên bộ từ quầy bar mà chọn
 * "Sân bay" thì AI phải ép từ vào một bối cảnh lạ. AI đọc bộ từ và chọn ra vài
 * dạng hợp nhất TRONG KHO SẴN CÓ (không bịa dạng mới) — người học vẫn chọn được
 * mọi dạng khác, đây chỉ là gợi ý nằm đầu danh sách.
 *
 * Gợi ý là tuỳ chọn: AI lỗi thì trả rỗng, không chặn màn hình và không lưu cache.
 */
const DangGoiY = require('../models/DangGoiY');
const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');
const UserUpload = require('../models/UserUpload');
const { textCompletion } = require('./aiClient');
const { chuanHoaKhoa } = require('./aiRoles');
const { phang } = require('./dangBai');
const logger = require('../utils/logger');

/** Kho dạng bài của từng chế độ — nạp lười để tránh vòng require. */
const KHO = {
    reading: () => require('./readingGrader').NHOM_DANG,
    essay: () => require('./essayGrader').NHOM_DANG_VIET,
    translation: () => require('./translationGrader').NHOM_DANG_DICH,
    listening: () => require('./listeningAi').NHOM_DANG_NGHE,
    conversation: () => require('./conversationAi').NHOM_TINH_HUONG,
};

const SO_GOI_Y_TOI_THIEU = 3;
const SO_GOI_Y_TOI_DA = 6;
/** Số từ mẫu gửi AI — đủ để nhận ra chủ đề, ít để tiết kiệm token. */
const SO_TU_MAU = 12;

/** Chế độ hợp lệ hay không. */
function laCheDo(mode) {
    return Object.prototype.hasOwnProperty.call(KHO, mode);
}

/**
 * Đọc câu trả lời của AI: chỉ giữ khoá CÓ trong kho, không trùng, tối đa 6.
 * AI có thể trả "email, notice" hay mỗi khoá một dòng, có dấu gạch đầu dòng.
 */
function tachKhoa(raw, nhom) {
    const hopLe = new Set(phang(nhom).map((d) => d.key));
    const ra = [];
    for (const t of String(raw || '').toLowerCase().split(/[^a-z0-9-]+/)) {
        if (hopLe.has(t) && !ra.includes(t)) ra.push(t);
        if (ra.length >= SO_GOI_Y_TOI_DA) break;
    }
    return ra;
}

/** Từ mẫu của Part: kho chung trước, rồi bộ từ riêng của người dùng. */
async function layTuMau({ source, part, lang, email }) {
    const zh = lang === 'zh';
    const Shared = zh ? VocabularyZh : Vocabulary;
    const truong = zh ? 'zh' : 'en';
    const [shared, mine] = await Promise.all([
        Shared.find({ source, part }).select(truong).limit(SO_TU_MAU).lean(),
        email ? UserUpload.find({ source, part, ownerEmail: email }).select('en').limit(SO_TU_MAU).lean() : [],
    ]);
    const tu = [...shared.map((w) => w[truong]), ...mine.map((w) => w.en)]
        .filter((t) => typeof t === 'string' && t.trim() && t.length <= 40)
        .map((t) => t.trim());
    return { tu: [...new Set(tu)].slice(0, SO_TU_MAU), chung: shared.length > 0 };
}

/**
 * Các khoá dạng bài hợp bộ từ của Part cho chế độ `mode`. Có cache thì trả cache
 * (đã lọc theo kho hiện tại); không thì hỏi AI một lần rồi lưu.
 */
async function goiYDang({ mode, source, part, lang, email, userId }) {
    if (!laCheDo(mode)) {
        const err = new Error('Chế độ không hợp lệ');
        err.status = 400;
        throw err;
    }
    let khoa;
    try {
        khoa = chuanHoaKhoa({ source, part, lang });
    } catch {
        // Chưa chọn đề/Part: không có gì để gợi ý — không phải lỗi.
        return [];
    }
    const nhom = KHO[mode]();
    const { tu, chung } = await layTuMau({ ...khoa, email });
    if (!tu.length) return [];
    const scope = chung ? '' : String(email || '');
    const loc = { mode, ...khoa, scope };

    const daLuu = await DangGoiY.findOne(loc).lean();
    if (daLuu) {
        // Lọc theo kho HIỆN TẠI: dạng đã bị xoá khỏi kho thì không hiện nữa.
        const con = tachKhoa(daLuu.keys.join(' '), nhom);
        if (con.length >= SO_GOI_Y_TOI_THIEU) return con;
    }

    let keys = [];
    try {
        const out = await textCompletion({
            feature: 'dang-goi-y',
            messages: [
                {
                    role: 'system',
                    content: [
                        'You match vocabulary to text types for language practice.',
                        `From the list, pick the ${SO_GOI_Y_TOI_THIEU} to ${SO_GOI_Y_TOI_DA} text types where these words would appear most naturally.`,
                        'Reply with the keys only, comma-separated, best first. No other text.',
                        'List (key: description):',
                        ...phang(nhom).map((d) => `${d.key}: ${d.en}`),
                    ].join('\n'),
                },
                { role: 'user', content: `Words: ${tu.join(', ')}` },
            ],
            maxTokens: 60,
            temperature: 0.3,
            userId,
        });
        keys = tachKhoa(out.text, nhom);
    } catch (err) {
        logger.warn('Gợi ý dạng bài: AI lỗi', { mode, error: err?.message });
        return [];
    }
    if (keys.length < SO_GOI_Y_TOI_THIEU) return keys;

    await DangGoiY.updateOne(loc, { $set: { keys } }, { upsert: true }).catch((err) => {
        // Hai người mở cùng lúc: bản kia đã lưu — bỏ qua, gợi ý vẫn trả về.
        if (err?.code !== 11000) logger.warn('Gợi ý dạng bài: không lưu được', { error: err?.message });
    });
    return keys;
}

module.exports = { goiYDang, tachKhoa, laCheDo, SO_GOI_Y_TOI_DA };
