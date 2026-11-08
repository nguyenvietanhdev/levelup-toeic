/**
 * AI RA BÀI NHẮM VÀO ĐIỂM YẾU — tầng 2 của hồ sơ năng lực.
 *
 * Trước đây mỗi phiên AI bắt đầu từ con số 0: AI hội thoại không biết người học
 * hay sai thì, AI ra đề viết không biết họ hay quên mạo từ. Hồ sơ "Tiến bộ của
 * tôi" (`tienBo.diemYeu`) đã tính sẵn các lỗi ngữ pháp LẶP LẠI (≥3 lần, bỏ nhóm
 * "Khác") — ở đây đổi chúng thành MỘT dòng chỉ thị ngắn chèn vào prompt ra bài.
 *
 * Nguyên tắc:
 *   · Chỉ TẠO CƠ HỘI dùng cấu trúc đó, không giảng, không nhắc tên lỗi — người
 *     học biết bài đang "soi" mình thì mất tự nhiên.
 *   · Chỉ một PHẦN bài (1–2 chỗ): bài nào cũng xoáy vào chỗ sai thì nản.
 *   · Tối đa 2 nhóm lỗi, ~40 token mỗi lần — chi phí gần như không đổi.
 *   · Theo ngôn ngữ: mỗi ngôn ngữ có bộ nhóm lỗi riêng (`errorTaxonomy`), và hồ sơ
 *     chỉ dùng khi nó tính cho đúng ngôn ngữ của bài đang ra.
 *   · Lỗi đọc hồ sơ KHÔNG được làm hỏng việc ra bài: hỏng thì ra bài như cũ.
 */
const { layTienBo } = require('./tienBo');

/**
 * Cách tạo cơ hội luyện cho từng nhóm lỗi (tiếng Anh vì đi thẳng vào prompt).
 * Nhóm không có ở đây (chính tả, dấu câu, khác) không nhắm được bằng nội dung.
 */
const CO_HOI = {
    article: 'singular countable nouns that need a/an/the',
    tense: 'talking about both past events and future plans, so tenses must change',
    agreement: 'third-person subjects (he, she, the company, everyone) with present-tense verbs',
    preposition: 'times, places and movement (in/on/at, to/from, during/for)',
    'word-order': 'questions and sentences with adverbs of frequency or several adjectives',
    'word-choice': 'precise descriptions where similar words (make/do, say/tell) must be chosen carefully',
    'literal-translation': 'complete sentences with a clear subject and verb, where a word-for-word translation from Vietnamese would fail',
    pronoun: 'object pronouns after verbs and prepositions (me, him, her, them)',
    plural: 'quantities with countable and uncountable nouns (many/much, a few/a little)',
};

/** Như trên, cho tiếng Trung. Nhóm viết sai chữ, dấu câu, khác không nhắm được bằng nội dung. */
const CO_HOI_ZH = {
    'measure-word': 'counting different kinds of objects, so different measure words (个, 本, 张, 件, 杯) are needed',
    aspect: 'finished actions and past experiences, so 了 and 过 are needed (including their negative forms with 没)',
    negation: 'contrasting what someone did not do yesterday (没) with what they do not do in general or will not do (不)',
    'particle-de': 'describing possessions, how well someone does something (V得…), and how something is done (…地V)',
    complement: 'whether actions were completed or possible (听懂, 做完, 看不清, 走进来)',
    'ba-bei': 'handling objects and things that happened to someone (把 and 被 sentences)',
    comparison: 'comparing two people or things (A比B…, A没有B…)',
    'word-order': 'when and where things happen, so time and place words must come before the verb',
    'word-choice': 'precise descriptions where similar words (会/能/可以, 知道/认识) must be chosen carefully',
    'literal-translation': 'complete sentences where a word-for-word translation from Vietnamese would fail',
};
const coHoiCua = (lang) => (lang === 'zh' ? CO_HOI_ZH : CO_HOI);

/** Nhóm lỗi nhắm được, tối đa 2, giữ thứ tự hay mắc nhất trước. */
function locNhamDuoc(diemYeu, lang = 'en') {
    const co = coHoiCua(lang);
    return (Array.isArray(diemYeu) ? diemYeu : [])
        .filter((d) => d?.loai === 'ngu-phap' && co[d.key])
        .slice(0, 2)
        .map((d) => ({ key: d.key, vi: d.vi }));
}

/**
 * Dòng chỉ thị cho từng chế độ. Rỗng khi không có gì để nhắm.
 *
 * @param {string[]} keys  khoá nhóm lỗi (đã lọc)
 * @param {'hoi-thoai'|'viet'|'dich'} cheDo
 */
function chiThiNham(keys, cheDo, lang = 'en') {
    const bang = coHoiCua(lang);
    const co = (keys || []).map((k) => bang[k]).filter(Boolean);
    if (!co.length) return '';
    const ds = co.join('; ');
    if (cheDo === 'hoi-thoai') {
        return `7. The learner often makes mistakes with: ${ds}. Now and then (not every turn) ask questions whose natural answer needs this. Never mention it or correct them.`;
    }
    if (cheDo === 'viet') {
        return `The learner often makes mistakes with: ${ds}. Choose a task whose answer naturally needs this, without mentioning grammar.`;
    }
    // Dịch: đoạn gốc tiếng Việt, người học dịch SANG ngoại ngữ.
    return `The learner often makes mistakes with: ${ds}. Include one or two sentences whose correct ${lang === 'zh' ? 'Chinese' : 'English'} translation needs this. Do not mention grammar.`;
}

/**
 * Điểm yếu nhắm được của người học, cho ngôn ngữ `lang`.
 *
 * Tính lại từ hồ sơ (cùng một nguồn với màn "Tiến bộ của tôi" — hai nơi không thể
 * nói hai điều khác nhau), cache ngắn theo người dùng: hồ sơ đổi theo tuần chứ
 * không theo phút, mà mỗi lần ra bài lại đọc 10 truy vấn thì phí.
 */
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

async function layNham(userId, lang = 'en') {
    if (!userId) return [];
    const ngonNgu = lang === 'zh' ? 'zh' : 'en';
    const k = `${userId}|${ngonNgu}`;
    const c = cache.get(k);
    if (c && Date.now() - c.at < CACHE_MS) return c.nham;
    try {
        const hs = await layTienBo(userId);
        // Hồ sơ tính theo ngôn ngữ đang học từ vựng. Bài ra cho ngôn ngữ khác thì
        // điểm yếu đó không phải của bài này: không nhắm gì còn hơn nhắm sai.
        const nham = (hs.lang || 'en') === ngonNgu ? locNhamDuoc(hs.diemYeu, ngonNgu) : [];
        cache.set(k, { at: Date.now(), nham });
        // Không để Map phình mãi trên server chạy lâu.
        if (cache.size > 2000) cache.delete(cache.keys().next().value);
        return nham;
    } catch {
        return [];
    }
}

/** Chỉ dùng trong test. */
function _xoaCache() { cache.clear(); }

module.exports = { layNham, chiThiNham, locNhamDuoc, CO_HOI, CO_HOI_ZH, _xoaCache };
