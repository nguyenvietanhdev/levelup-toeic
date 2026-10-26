/**
 * CHỌN TỪ CHO CÁC CHẾ ĐỘ AI — một nơi duy nhất cho Hội thoại, Nghe, Đọc, Dịch.
 *
 * Trước đây mỗi chế độ chọn một kiểu: Hội thoại ưu tiên từ sai ở server, Nghe chọn
 * ngẫu nhiên ở server, Đọc và Dịch chọn ngẫu nhiên ở TRÌNH DUYỆT bằng `w.en` — mà kho
 * tiếng Trung để `en` rỗng (chữ Hán nằm ở `zh`), nên bài đọc / đoạn dịch tiếng Trung
 * không bám bộ từ nào cả. Gom về đây thì mọi chế độ:
 *   · đọc đúng mặt từ (`zh` hoặc `en`) qua `faceOf`;
 *   · gồm cả từ vựng riêng người học tải lên cùng đề / Part;
 *   · tôn trọng bộ lọc mức độ ở thanh trên;
 *   · ƯU TIÊN từ đang sai (WrongWord còn `active`) theo một tỉ lệ — để mọi chế độ AI
 *     đều giúp ôn từ yếu, không chỉ Hội thoại.
 */
const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');
const UserUpload = require('../models/UserUpload');
const WrongWord = require('../models/WrongWord');

/**
 * Mặt từ dùng để so khớp và đưa vào prompt.
 *
 * Hai kho đặt tên khác nhau: kho tiếng Anh dùng `en`, kho tiếng Trung dùng `zh`
 * (và bỏ trống `en`, hoặc để phiên âm). Lấy sai trường thì không lỗi nào báo, chỉ là
 * danh sách từ rỗng.
 */
function faceOf(w) {
    if (!w) return '';
    const zh = typeof w.zh === 'string' ? w.zh.trim() : '';
    const en = typeof w.en === 'string' ? w.en.trim() : '';
    // Ưu tiên `zh` khi có: bản ghi tiếng Trung nào cũng có `zh`, còn `en` có thể
    // là chuỗi rỗng hoặc phiên âm.
    return zh || en;
}

/** Toàn bộ từ của một đề (kho chung + từ vựng riêng của người học). */
async function fetchWords({ email, source, part, lang }) {
    const filter = { source };
    if (part) filter.part = part;

    const SharedModel = lang === 'zh' ? VocabularyZh : Vocabulary;
    const [shared, mine] = await Promise.all([
        // `zh` phải nằm trong `select`: kho tiếng Trung lưu chữ Hán ở `zh`.
        SharedModel.find(filter).select('en zh vn level').lean(),
        email ? UserUpload.find({ ...filter, ownerEmail: email, lang }).select('en zh vn level').lean() : [],
    ]);
    return [...shared, ...mine];
}

function tron(a) {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
}

/**
 * Chọn `soLuong` từ trong `mat` (danh sách mặt từ đã khử trùng), ưu tiên từ đang sai.
 *
 * `tiLeYeu` = phần tối đa dành cho từ đang sai (1 = mọi từ sai đứng trước, như Hội
 * thoại; 0.5 = tối đa một nửa). Thiếu từ sai thì bù bằng từ thường và ngược lại —
 * luôn ra đủ `soLuong` nếu bộ từ đủ. Trộn ngẫu nhiên trong từng nhóm để mỗi lượt một khác.
 */
async function chonTrongDanhSach({ userId, mat, soLuong, tiLeYeu = 0.5 }) {
    const all = [...new Set(mat.filter(Boolean))];
    if (all.length <= soLuong) return tron(all);

    // Từ ĐANG sai (chưa thuộc). WrongWord có thể lưu mặt từ ở `en` HOẶC `zh` tuỳ kho
    // gốc — dùng chung `faceOf` để hai bên so khớp được.
    const sai = userId
        ? await WrongWord.find({ userId, status: 'active' }).select('en zh').lean()
        : [];
    const saiSet = new Set(sai.map(faceOf).filter(Boolean));

    const yeu = tron(all.filter((w) => saiSet.has(w)));
    const con = tron(all.filter((w) => !saiSet.has(w)));
    const soYeu = Math.min(yeu.length, Math.ceil(soLuong * tiLeYeu));
    const chon = [...yeu.slice(0, soYeu), ...con.slice(0, soLuong - soYeu)];
    // Từ thường không đủ → lấy thêm từ sai còn lại.
    if (chon.length < soLuong) chon.push(...yeu.slice(soYeu, soYeu + (soLuong - chon.length)));
    return chon;
}

/**
 * Chọn từ cho một lượt AI theo bộ từ đang chọn trong hồ sơ.
 *
 * @param {object} o
 * @param {string} o.userId
 * @param {string} o.email
 * @param {object} o.settings  `profile.settings` (selectedSource, selectedPart, levelFilter)
 * @param {'en'|'zh'} o.lang
 * @param {number} o.soLuong
 * @param {number} [o.tiLeYeu]
 * @returns {Promise<{ tu: string[], tongTrongBo: number, loi?: 'chua-chon-de' }>}
 */
async function chonTu({ userId, email, settings = {}, lang = 'en', soLuong, tiLeYeu = 0.5 }) {
    // Giữ NGUYÊN chữ hoa/thường: schema từ vựng không ép chữ thường, hạ xuống là có
    // đề không khớp được.
    const source = typeof settings.selectedSource === 'string' ? settings.selectedSource.trim() : '';
    if (!source) return { tu: [], tongTrongBo: 0, loi: 'chua-chon-de' };
    const part = typeof settings.selectedPart === 'string' ? settings.selectedPart.trim() : '';
    const levelFilter = Array.isArray(settings.levelFilter) && settings.levelFilter.length
        ? new Set(settings.levelFilter) : null;

    const words = (await fetchWords({ email, source, part, lang }))
        .filter((w) => !levelFilter || levelFilter.has(w.level));
    const mat = [...new Set(words.map(faceOf).filter(Boolean))];
    const tu = await chonTrongDanhSach({ userId, mat, soLuong, tiLeYeu });
    return { tu, tongTrongBo: mat.length };
}

module.exports = { chonTu, chonTrongDanhSach, fetchWords, faceOf };
