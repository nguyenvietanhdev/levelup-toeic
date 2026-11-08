/**
 * Phân loại LỖI NGỮ PHÁP thành nhóm cố định, để thống kê được.
 *
 * Vì sao cần: AI trả về `issue` là văn xuôi tự do ("Sử dụng từ 'overwhelming'
 * không rõ ràng trong ngữ cảnh này"). Đọc từng bài thì hiểu, nhưng không trả
 * lời được câu quan trọng nhất: "tôi hay sai gì nhất?". Hai bài viết cách nhau
 * một tháng cùng sai mạo từ sẽ mô tả bằng hai câu chữ khác hẳn nhau.
 *
 * Nhãn do AI gán NGAY KHI CHẤM chứ không suy ra sau bằng từ khoá: nó đang đọc
 * bài và biết chính xác lỗi là gì, còn dò từ khoá trên câu tiếng Việt là đoán
 * mò trên một bản dịch của điều nó đã biết.
 *
 * Danh sách CỐ ĐỊNH và ngắn. Để AI tự đặt tên nhóm thì mỗi lần chấm ra một tên
 * khác ("mạo từ", "articles", "a/an/the") và thống kê lại vô nghĩa như cũ.
 */

/**
 * Các nhóm lỗi, xếp theo mức phổ biến với người Việt.
 *
 * `vi` là thứ hiện cho người học; `hint` là gợi ý luyện tập khi nhóm đó nổi lên
 * — biết mình sai nhiều mà không biết làm gì tiếp thì thống kê chỉ để ngắm.
 *
 * `lang`: nhóm áp dụng cho ngôn ngữ nào. Tiếng Trung không có mạo từ, thì hay số
 * nhiều; ngược lại tiếng Anh không có lượng từ hay 了. Hỏi AI gán "article" cho
 * một bài tiếng Trung là mời nó gán bừa. Nhóm dùng chung có thể có `hintZh` khi
 * cách sửa khác hẳn (trật tự từ tiếng Trung: thời gian, nơi chốn đứng TRƯỚC động từ).
 *
 * KHÔNG đổi `key` của nhóm đã có: bài cũ lưu theo key.
 */
const EN = ['en'];
const ZH = ['zh'];
const CA_HAI = ['en', 'zh'];
const LOAI_LOI = [
    { key: 'article', lang: EN, vi: 'Mạo từ (a/an/the)', hint: 'Danh từ đếm được số ít gần như luôn cần mạo từ.' },
    { key: 'tense', lang: EN, vi: 'Thì của động từ', hint: 'Xác định mốc thời gian của câu trước khi chọn thì.' },
    { key: 'agreement', lang: EN, vi: 'Hoà hợp chủ ngữ – động từ', hint: 'Tìm chủ ngữ thật, đừng lấy danh từ đứng gần động từ nhất.' },
    { key: 'preposition', lang: EN, vi: 'Giới từ', hint: 'Giới từ đi liền với từ đứng trước — học theo cụm, không học rời.' },
    // Tiếng Trung: các nhóm người Việt hay sai nhất.
    { key: 'measure-word', lang: ZH, vi: 'Lượng từ', hint: 'Giữa số / 这 / 那 và danh từ luôn có lượng từ: 三本书, không nói 三书.' },
    { key: 'aspect', lang: ZH, vi: 'Trợ từ 了 / 过 / 着', hint: 'Đã xong dùng V + 了, đã từng dùng V + 过; phủ định bằng 没 thì bỏ 了.' },
    { key: 'negation', lang: ZH, vi: 'Phủ định 不 / 没', hint: 'Việc đã không xảy ra dùng 没; thói quen, ý muốn, tương lai dùng 不.' },
    { key: 'particle-de', lang: ZH, vi: '的 / 得 / 地', hint: 'Trước danh từ dùng 的, sau động từ dùng 得, trước động từ dùng 地.' },
    { key: 'complement', lang: ZH, vi: 'Bổ ngữ', hint: 'Kết quả đứng ngay sau động từ: 听懂, 做完; không làm được thì chen 不: 听不懂.' },
    { key: 'ba-bei', lang: ZH, vi: 'Câu 把 / 被', hint: 'Sau 把 / 被, động từ phải có thành phần đi kèm: 把门关上, không dừng ở 把门关.' },
    { key: 'comparison', lang: ZH, vi: 'So sánh', hint: 'A 比 B + tính từ, không thêm 很: 他比我高; không bằng thì dùng 没有.' },
    {
        key: 'word-order', lang: CA_HAI, vi: 'Trật tự từ',
        hint: 'Tiếng Anh: chủ ngữ – động từ – tân ngữ; trạng ngữ hiếm khi chen giữa.',
        hintZh: 'Thời gian và nơi chốn đứng TRƯỚC động từ: 我明天在家学习, không nói 我学习在家.',
    },
    { key: 'word-choice', lang: CA_HAI, vi: 'Chọn từ chưa đúng', hint: 'Từ đúng nghĩa chưa chắc đúng ngữ cảnh — tra cụm đi kèm.' },
    // Tách khỏi "chọn từ": lỗi ở KHUNG CÂU (thiếu động từ, ghép theo tiếng Việt), đổi từ không sửa được.
    {
        key: 'literal-translation', lang: CA_HAI, vi: 'Dịch từng chữ',
        hint: 'Dựng khung trước: chủ ngữ + động từ, rồi mới thêm phần còn lại.',
        hintZh: 'Dựng khung trước: chủ ngữ + thời gian + nơi chốn + động từ, rồi mới thêm phần còn lại.',
    },
    { key: 'pronoun', lang: EN, vi: 'Đại từ', hint: 'Sau động từ dùng me, him, her, them — không dùng I, he, she, they.' },
    { key: 'plural', lang: EN, vi: 'Số ít / số nhiều', hint: 'Danh từ không đếm được không thêm -s.' },
    { key: 'spelling', lang: EN, vi: 'Chính tả', hint: 'Đọc lại một lượt trước khi nộp.' },
    // Chính tả của tiếng Trung là viết nhầm chữ, thường do gõ pinyin chọn nhầm chữ đồng âm.
    { key: 'character', lang: ZH, vi: 'Viết sai chữ Hán', hint: 'Gõ pinyin dễ chọn nhầm chữ đồng âm (在/再, 的/得): đọc lại từng chữ trước khi nộp.' },
    {
        key: 'punctuation', lang: CA_HAI, vi: 'Dấu câu',
        hint: 'Hai mệnh đề độc lập không nối bằng dấu phẩy.',
        hintZh: 'Dùng dấu câu Trung: ，。？！, và dấu 、 khi liệt kê.',
    },
    // Nhóm hứng: AI gán nhãn lạ, hoặc lỗi không thuộc nhóm nào ở trên. Có nó
    // thì mọi lỗi đều đếm được; thiếu nó thì lỗi lạ bị VỨT ÂM THẦM và tổng số
    // trong thống kê nhỏ hơn số lỗi thật mà không ai biết.
    { key: 'other', lang: CA_HAI, vi: 'Khác', hint: '' },
];

const KEYS = new Set(LOAI_LOI.map((l) => l.key));

/** Ngôn ngữ hợp lệ, hoặc null = không lọc theo ngôn ngữ (thuần). */
const chuanLang = (lang) => (lang === 'zh' ? 'zh' : lang === 'en' ? 'en' : null);

/** Các nhóm áp dụng cho một ngôn ngữ; không truyền thì mọi nhóm (thuần). */
function loaiCua(lang) {
    const l = chuanLang(lang);
    return l ? LOAI_LOI.filter((x) => x.lang.includes(l)) : LOAI_LOI;
}

/** Nhãn tiếng Việt của một nhóm. Nhóm lạ → 'Khác', không trả undefined. */
function nhanLoi(key) {
    return (LOAI_LOI.find((l) => l.key === key) || LOAI_LOI[LOAI_LOI.length - 1]).vi;
}

/** Gợi ý luyện tập cho một nhóm, theo ngôn ngữ của bài khi nhóm có gợi ý riêng. */
function goiYLoi(key, lang) {
    const l = LOAI_LOI.find((x) => x.key === key) || {};
    return (chuanLang(lang) === 'zh' && l.hintZh) || l.hint || '';
}

/**
 * Chuẩn hoá nhãn AI trả về.
 *
 * AI hay trả `"Article"`, `"articles"`, `"ARTICLE"` cho cùng một nhóm — ba
 * chuỗi khác nhau thì thống kê tách thành ba dòng. Hạ chữ thường, bỏ `-s`
 * số nhiều, và nhãn nào không nhận ra thì về `other` chứ không vứt đi.
 */
function chuanHoaLoai(raw, lang) {
    const k = String(raw || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
    // `articles` → `article`, `prepositions` → `preposition`.
    const key = KEYS.has(k) ? k : (KEYS.has(k.replace(/s$/, '')) ? k.replace(/s$/, '') : 'other');
    // Biết ngôn ngữ của bài thì nhãn không thuộc ngôn ngữ đó là gán bừa
    // ("article" cho bài tiếng Trung) → 'other', không để nó lọt vào thống kê.
    const l = chuanLang(lang);
    if (l && !LOAI_LOI.find((x) => x.key === key).lang.includes(l)) return 'other';
    return key;
}

/**
 * Dòng chỉ thị chèn vào prompt chấm bài, để AI gán nhãn ngay.
 *
 * Đặt ở đây thay vì chép vào từng bộ chấm: hai bản sao thì thêm một nhóm lỗi
 * phải sửa hai chỗ, và quên một chỗ thì nhóm mới im lặng không bao giờ xuất
 * hiện từ nguồn đó.
 */
function chiThiPhanLoai(lang = 'en') {
    return [
        `Also tag each item with "type", one of: ${khoaCua(lang)}.`,
        'Use exactly these keys, lowercase. Use "other" if none fits.',
    ].join('\n');
}

/**
 * Gom danh sách lỗi thành thống kê theo nhóm, nhiều nhất trước.
 *
 * @param {Array<{type?:string}>} items lỗi từ nhiều bài gộp lại
 * @returns {Array<{key:string, vi:string, hint:string, count:number}>}
 */
function thongKe(items, lang) {
    const dem = new Map();
    for (const it of Array.isArray(items) ? items : []) {
        // Hai nguồn dùng hai tên trường: Translation lưu `loai` (vì `type` là
        // từ khoá Mongoose), Essay lưu `type` trong mảng Mixed nên giữ nguyên
        // tên AI trả về. Đọc cả hai thay vì ép một nguồn đổi tên.
        const k = chuanHoaLoai(it?.loai ?? it?.type);
        dem.set(k, (dem.get(k) || 0) + 1);
    }
    return [...dem.entries()]
        .map(([key, count]) => ({ key, vi: nhanLoi(key), hint: goiYLoi(key, lang), count }))
        // Nhiều nhất trước; bằng nhau thì theo thứ tự trong `LOAI_LOI` để kết
        // quả ổn định giữa các lần gọi — thứ tự nhảy lung tung trông như dữ
        // liệu đang đổi trong khi không có gì đổi cả.
        .sort((a, b) => b.count - a.count
            || LOAI_LOI.findIndex((l) => l.key === a.key) - LOAI_LOI.findIndex((l) => l.key === b.key));
}

/**
 * Chỉ thị cho phần CHỮA BÀI trên chính bài làm (giao diện "bút đỏ"):
 *   · `quote` phải là đoạn NGUYÊN VĂN, ngắn — giao diện tìm nó trong bài để gạch
 *     chân; trích sai một chữ là không định vị được.
 *   · Cụm sửa (`fix` / `better`) là chữ THAY THẾ đúng đoạn đó, cùng ngôn ngữ với
 *     bài — không phải lời giải thích. Nhờ vậy ghép lại được bản "Đã sửa" và người
 *     học tự sửa rồi so được.
 *   · `level`: "error" = sai (bắt buộc sửa), "style" = đúng nhưng chưa tự nhiên.
 *
 * @param {string} truongSua tên trường cụm sửa ('fix' với Viết, 'better' với Dịch)
 */
function chiThiChuaBai(truongSua) {
    return [
        `Each "quote" must be copied EXACTLY from the learner's text, as short as possible (a few words), so it can be found and underlined.`,
        `"${truongSua}" is ONLY the corrected wording that replaces "quote" in the same place, in the same language as the learner's text — never an explanation.`,
        'Add "level" to each item: "error" for a real mistake, "style" for correct but unnatural wording.',
    ].join('\n');
}

/** Mức độ của một lỗi. Lạ / thiếu → 'loi' (coi là sai): báo nhẹ hơn thực tế còn tệ hơn. */
function chuanHoaMuc(level) {
    return level === 'style' ? 'nen' : 'loi';
}

/** Danh sách khoá cho prompt, theo ngôn ngữ của bài (thuần). */
function khoaCua(lang = 'en') {
    return loaiCua(chuanLang(lang) || 'en').map((l) => l.key).join(', ');
}

module.exports = {
    LOAI_LOI, loaiCua, khoaCua, chuanHoaLoai, nhanLoi, goiYLoi, chiThiPhanLoai, thongKe, chiThiChuaBai, chuanHoaMuc,
};
