/**
 * SỔ ĐĂNG KÝ NGÔN NGỮ (backend) — đọc `config/ngonNgu.json`, nguồn duy nhất dùng chung với
 * frontend (`frontend/src/lib/ngonNgu.js` đọc CÙNG file qua alias `@ngonNgu`). File nằm trong
 * `backend/` chứ không ở thư mục chung ngoài gốc: ảnh Docker build với ngữ cảnh chỉ là `backend/`,
 * để ngoài là backend sập khi khởi động vì thiếu file. Đổi ngôn ngữ ở một nơi, mọi nơi tự theo: thay cho các
 * ternary `lang === 'zh' ? … : …` mà ngôn ngữ thứ ba sẽ âm thầm rơi vào nhánh tiếng Anh.
 *
 * Hai lớp hàm (backend/frontend) phải cho cùng kết quả — `tests/ngonNgu.test.js` kiểm.
 */
const SO = require('./ngonNgu.json');

const DS = SO.ngonNgu;
const THEO_MA = new Map(DS.map((n) => [n.ma, n]));
const MAC_DINH = SO.macDinh;

/** Mọi mã đã khai báo (dùng cho enum DB: bật ngôn ngữ mới không phải sửa schema). */
const MA_NGON_NGU = DS.map((n) => n.ma);
/** Thêm 'bi' (chế độ bộ từ song ngữ Trung–Anh) cho trường lưu cả chế độ đó (vocabLang, lang của bộ từ…). */
const MA_NGON_NGU_BI = [...MA_NGON_NGU, 'bi'];
/** Ngôn ngữ đang mở cho người học. */
const NGON_NGU_HOAT_DONG = DS.filter((n) => n.hoatDong).map((n) => n.ma);

const MAU = Object.fromEntries(Object.entries(SO.mauChuViet).map(([k, v]) => [k, new RegExp(v)]));

/** Khai báo đầy đủ của một ngôn ngữ; mã lạ → ngôn ngữ mặc định. */
function layNgonNgu(ma) {
    return THEO_MA.get(ma) || THEO_MA.get(MAC_DINH);
}

/** Mã hợp lệ để dùng: mã đang hoạt động thì giữ, còn lại (chưa mở / lạ / rỗng) → mặc định. */
function chuanMa(ma) {
    return NGON_NGU_HOAT_DONG.includes(ma) ? ma : MAC_DINH;
}

/**
 * Ngôn ngữ đoán từ CHỮ VIẾT của nội dung (thuần): kana → ja, hangul → ko, Hán → zh (Kana kiểm
 * trước Hán: văn bản Nhật có Kanji không được nhận là tiếng Trung). Chữ Latin không phân biệt
 * được (Anh/Pháp…) → null.
 */
function nhanDienChuViet(text) {
    const s = String(text || '');
    for (const chu of SO.thuTuNhanDien) {
        if (MAU[chu]?.test(s)) return DS.find((n) => n.chuViet === chu)?.ma || null;
    }
    return null;
}

/** Ngôn ngữ đang HỌC từ thiết lập `vocabLang` ('bi' = bộ song ngữ Trung–Anh → học tiếng Trung). */
const ngonNguHoc = (vocabLang) => (vocabLang === 'bi' ? 'zh' : chuanMa(vocabLang));

/** `vocabLang` người dùng được đặt: ngôn ngữ đang mở hoặc 'bi'. */
const vocabLangHopLe = (v) => v === 'bi' || NGON_NGU_HOAT_DONG.includes(v);

/**
 * Thiết lập client gửi lên, bỏ `vocabLang` nếu là ngôn ngữ chưa mở (thuần). Enum DB giờ nhận mọi
 * mã đã khai (cả ja/ko chưa mở) — không lọc ở đây thì người dùng tự đặt được ngôn ngữ chưa có nội dung.
 */
function locThietLap(settings) {
    if (!settings || typeof settings !== 'object') return settings;
    if (!Object.prototype.hasOwnProperty.call(settings, 'vocabLang') || vocabLangHopLe(settings.vocabLang)) return settings;
    const { vocabLang, ...con } = settings; // eslint-disable-line no-unused-vars
    return con;
}

/**
 * Điều kiện Mongo lọc bản ghi theo ngôn ngữ. Bản ghi cũ không có `lang` (trước khi có tiếng Trung)
 * thuộc ngôn ngữ mặc định → mặc định lấy mọi thứ KHÔNG phải ngôn ngữ khác đã khai.
 */
function locTheoNgonNgu(lang) {
    const ma = chuanMa(lang);
    return ma === MAC_DINH ? { lang: { $nin: MA_NGON_NGU.filter((m) => m !== MAC_DINH) } } : { lang: ma };
}

/** Mã kỹ năng của hồ sơ học: ngôn ngữ mặc định giữ tên gốc ('noi'), ngôn ngữ khác thêm tiền tố ('zh-noi'). */
function maKyNang(lang, ky) {
    const ma = chuanMa(lang);
    return ma === MAC_DINH ? ky : `${ma}-${ky}`;
}

const tenChoPrompt = (ma) => layNgonNgu(ma).tenPrompt;
const bcp47 = (ma) => layNgonNgu(ma).bcp47;
const giongEdge = (ma) => layNgonNgu(ma).giongEdge;
const donViDem = (ma) => layNgonNgu(ma).donViDem;

module.exports = {
    SO, MAC_DINH, MA_NGON_NGU, MA_NGON_NGU_BI, NGON_NGU_HOAT_DONG,
    layNgonNgu, chuanMa, nhanDienChuViet, ngonNguHoc, vocabLangHopLe, locThietLap, locTheoNgonNgu, maKyNang, tenChoPrompt, bcp47, giongEdge, donViDem,
};
