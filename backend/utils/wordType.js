/**
 * Chuẩn hoá trường `type` (loại từ).
 *
 * Kho tiếng Trung từng có 95 giá trị khác nhau cho một trường lẽ ra chỉ vài
 * chục, vì ba loại lộn xộn cùng tồn tại:
 *
 *   1. DẤU CÁCH quanh "/" — `动词/名词` và `动词 / 名词` là một.
 *   2. THỨ TỰ — `动词/名词` và `名词/动词` cũng là một.
 *   3. ĐỒNG NGHĨA — `叹词` và `感叹词` đều là thán từ.
 *
 * Cách gộp: tách theo "/", bỏ khoảng trắng, quy đồng nghĩa về một dạng, bỏ
 * trùng, rồi SẮP XẾP theo thứ tự từ loại chuẩn. Nhờ vậy mọi hoán vị của cùng
 * một tổ hợp đều ra một chuỗi duy nhất.
 *
 * Dùng ở HAI nơi — lúc nhập từ mới (uploadController) và script chuẩn hoá dữ
 * liệu cũ. Chép làm hai bản thì dữ liệu mới lại lệch với dữ liệu đã dọn.
 */

/**
 * Thứ tự từ loại chuẩn — quyết định cách sắp khi một từ có nhiều loại.
 * Loại phổ biến đặt trước để `名词/动词` đọc tự nhiên hơn `动词/名词`.
 */
const ZH_ORDER = [
    '名词', '动词', '形容词', '副词', '代词', '量词', '数词', '数量词',
    '介词', '连词', '助词', '助动词', '叹词', '拟声词',
    '成语', '短语', '名词短语', '动词短语', '形容词短语', '副词短语',
    '连词短语', '代词短语', '前缀', '后缀',
];

/** Thứ tự cho tiếng Anh — cùng nguyên tắc. */
const EN_ORDER = [
    'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
    'conjunction', 'interjection', 'determiner', 'particle', 'measure word',
    'number', 'phrase', 'noun phrase', 'verb phrase', 'phrasal verb',
    'prefix', 'suffix',
];

/**
 * Nhãn tiếng Anh → chữ Hán, cho từ vựng TIẾNG TRUNG.
 *
 * Kho chung zh ghi `名词`, còn từ người dùng tải lên lại ghi `noun` — cùng là
 * danh từ mà nằm ở hai mục khác nhau, nên lọc `名词` sẽ không ra từ nào của
 * người dùng. Quy về chữ Hán vì đó là hệ mà 11.783/12.266 từ đang dùng, và
 * cũng là cách tiếng Trung được dạy.
 */
const EN_TO_ZH = {
    noun: '名词',
    verb: '动词',
    adjective: '形容词',
    adverb: '副词',
    pronoun: '代词',
    preposition: '介词',
    conjunction: '连词',
    interjection: '叹词',
    particle: '助词',
    'measure word': '量词',
    measureword: '量词',
    classifier: '量词',
    number: '数词',
    numeral: '数词',
    phrase: '短语',
    'noun phrase': '名词短语',
    'verb phrase': '动词短语',
    // `phrasal verb` là khái niệm của tiếng Anh, tiếng Trung không có — quy về
    // `动词短语` (cụm động từ), thứ gần nghĩa nhất. Thiếu dòng này thì 2 từ trong
    // `zh_word_topic` nằm riêng một mục Latin giữa danh sách chữ Hán.
    'phrasal verb': '动词短语',
    'adjective phrase': '形容词短语',
    'adverb phrase': '副词短语',
    idiom: '成语',
    prefix: '前缀',
    suffix: '后缀',
    onomatopoeia: '拟声词',
    'auxiliary verb': '助动词',
    determiner: '代词',
};

/** Từ đồng nghĩa → dạng chuẩn. */
const SYNONYMS = {
    '感叹词': '叹词',
};

/**
 * Nhãn KHÔNG phải từ loại — giữ nguyên, không tách/sắp xếp.
 * `bộ thủ` là nhãn tiếng Việt cho bộ thủ chữ Hán (483 từ trong kho zh).
 */
const KEEP_AS_IS = new Set(['bộ thủ']);

/**
 * @param {string} raw   giá trị `type` thô
 * @param {'en'|'zh'} lang  tiếng Anh viết thường, tiếng Trung giữ nguyên chữ Hán
 * @returns {string}
 */
function normalizeWordType(raw, lang = 'zh') {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (KEEP_AS_IS.has(s)) return s;

    const isZh = lang === 'zh';

    /**
     * Một thành phần → dạng chuẩn.
     *
     * Với tiếng Trung: nhãn tiếng Anh được QUY ĐỔI sang chữ Hán, để từ người
     * dùng tải lên (`noun`) gộp chung mục với kho chung (`名词`). Không quy đổi
     * thì lọc `名词` bỏ sót toàn bộ từ của người dùng.
     * Với tiếng Anh: chỉ hạ chữ thường.
     */
    const norm = (p) => {
        if (!isZh) return p.toLowerCase();
        const zh = EN_TO_ZH[p.toLowerCase()];
        return zh || p;
    };

    const parts = s
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => SYNONYMS[p] || norm(p))
        // Quy đổi xong mới tra đồng nghĩa lần nữa: "interjection" → `叹词` là
        // đích rồi, nhưng "感叹词" gõ tay vẫn phải gộp về `叹词`.
        .map((p) => SYNONYMS[p] || p);

    if (!parts.length) return '';

    const order = isZh ? ZH_ORDER : EN_ORDER;
    const uniq = [...new Set(parts)];
    uniq.sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        // Loại lạ (không có trong bảng) xếp cuối, giữ thứ tự chữ cái giữa chúng.
        if (ia === -1 && ib === -1) return a.localeCompare(b, isZh ? 'zh' : 'en');
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    return uniq.join('/');
}

module.exports = { normalizeWordType, ZH_ORDER, EN_ORDER, KEEP_AS_IS, EN_TO_ZH };
