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

const tenChoPrompt = (ma) => layNgonNgu(ma).tenPrompt;
const bcp47 = (ma) => layNgonNgu(ma).bcp47;
const giongEdge = (ma) => layNgonNgu(ma).giongEdge;
const donViDem = (ma) => layNgonNgu(ma).donViDem;

module.exports = {
    SO, MAC_DINH, MA_NGON_NGU, NGON_NGU_HOAT_DONG,
    layNgonNgu, chuanMa, nhanDienChuViet, ngonNguHoc, tenChoPrompt, bcp47, giongEdge, donViDem,
};
