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
 *   · Chỉ tiếng Anh: bộ phân loại lỗi (`errorTaxonomy`) viết cho tiếng Anh.
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
    plural: 'quantities with countable and uncountable nouns (many/much, a few/a little)',
};

/** Nhóm lỗi nhắm được, tối đa 2, giữ thứ tự hay mắc nhất trước. */
function locNhamDuoc(diemYeu) {
    return (Array.isArray(diemYeu) ? diemYeu : [])
        .filter((d) => d?.loai === 'ngu-phap' && CO_HOI[d.key])
        .slice(0, 2)
        .map((d) => ({ key: d.key, vi: d.vi }));
}

/**
 * Dòng chỉ thị cho từng chế độ. Rỗng khi không có gì để nhắm.
 *
 * @param {string[]} keys  khoá nhóm lỗi (đã lọc)
 * @param {'hoi-thoai'|'viet'|'dich'} cheDo
 */
function chiThiNham(keys, cheDo) {
    const co = (keys || []).map((k) => CO_HOI[k]).filter(Boolean);
    if (!co.length) return '';
    const ds = co.join('; ');
    if (cheDo === 'hoi-thoai') {
        return `7. The learner often makes mistakes with: ${ds}. Now and then (not every turn) ask questions whose natural answer needs this. Never mention it or correct them.`;
    }
    if (cheDo === 'viet') {
        return `The learner often makes mistakes with: ${ds}. Choose a task whose answer naturally needs this, without mentioning grammar.`;
    }
    // Dịch: đoạn gốc tiếng Việt, người học dịch SANG tiếng Anh.
    return `The learner often makes mistakes with: ${ds}. Include one or two sentences whose correct English translation needs this. Do not mention grammar.`;
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
    if (!userId || lang === 'zh') return [];
    const k = String(userId);
    const c = cache.get(k);
    if (c && Date.now() - c.at < CACHE_MS) return c.nham;
    try {
        const hs = await layTienBo(userId);
        const nham = locNhamDuoc(hs.diemYeu);
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

module.exports = { layNham, chiThiNham, locNhamDuoc, CO_HOI, _xoaCache };
