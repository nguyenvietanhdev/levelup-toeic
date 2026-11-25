/**
 * SỔ ĐĂNG KÝ NGÔN NGỮ (frontend) — đọc `backend/config/ngonNgu.json` (alias `@ngonNgu`), nguồn
 * duy nhất dùng chung với backend (`backend/config/ngonNgu.js`). Đổi ngôn ngữ ở một nơi, mọi nơi tự theo.
 *
 * Hai lớp hàm (backend/frontend) phải cho cùng kết quả — `ngonNgu.test.js` kiểm.
 */
import SO from '@ngonNgu';

const DS = SO.ngonNgu;
const THEO_MA = new Map(DS.map((n) => [n.ma, n]));
export const MAC_DINH = SO.macDinh;

/** Mọi mã đã khai báo. */
export const MA_NGON_NGU = DS.map((n) => n.ma);
/** Ngôn ngữ đang mở cho người học (ô chọn ngôn ngữ học sinh từ danh sách này). */
export const NGON_NGU_HOAT_DONG = DS.filter((n) => n.hoatDong).map((n) => n.ma);

const MAU = Object.fromEntries(Object.entries(SO.mauChuViet).map(([k, v]) => [k, new RegExp(v)]));

/** Khai báo đầy đủ của một ngôn ngữ; mã lạ → ngôn ngữ mặc định. */
export function layNgonNgu(ma) {
    return THEO_MA.get(ma) || THEO_MA.get(MAC_DINH);
}

/** Mã hợp lệ để dùng: mã đang hoạt động thì giữ, còn lại → mặc định. */
export function chuanMa(ma) {
    return NGON_NGU_HOAT_DONG.includes(ma) ? ma : MAC_DINH;
}

/** Ngôn ngữ đoán từ chữ viết (kana → ja, hangul → ko, Hán → zh; Latin → null). */
export function nhanDienChuViet(text) {
    const s = String(text || '');
    for (const chu of SO.thuTuNhanDien) {
        if (MAU[chu]?.test(s)) return DS.find((n) => n.chuViet === chu)?.ma || null;
    }
    return null;
}

/** Ngôn ngữ đang HỌC từ `vocabLang` ('bi' = bộ song ngữ Trung–Anh → học tiếng Trung). */
export const ngonNguHoc = (vocabLang) => (vocabLang === 'bi' ? 'zh' : chuanMa(vocabLang));

/** `vocabLang` người dùng được đặt: ngôn ngữ đang mở hoặc 'bi'. */
export const vocabLangHopLe = (v) => v === 'bi' || NGON_NGU_HOAT_DONG.includes(v);

/** Tên đơn vị đếm độ dài bài ('chữ' với tiếng Trung/Nhật, 'từ' với ngôn ngữ có khoảng trắng). */
export const tenDonVi = (ma) => (layNgonNgu(ma).donViDem === 'chu' ? 'chữ' : 'từ');

const MAU_DEM = new Map(DS.filter((n) => n.donViDem === 'chu').map((n) => [
    n.ma, new RegExp('[' + (n.chuDem || [n.chuViet]).map((c) => SO.mauChuViet[c].slice(1, -1)).join('') + ']', 'g'),
]));
/** Độ dài bài theo đúng đơn vị của ngôn ngữ (như backend: đếm chữ thuộc hệ chữ, hoặc đếm từ). */
export function demDonVi(text, ma) {
    const s = String(text || '');
    const mau = MAU_DEM.get(layNgonNgu(ma).ma);
    if (mau) return (s.match(mau) || []).length;
    return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Ngôn ngữ viết cách từ bằng khoảng trắng. */
export const coKhoangTrang = (ma) => layNgonNgu(ma).tachTu === 'khoangTrang';
/** Tên ngắn ('Anh', 'Trung') cho nhãn chật chỗ. */
export const tenNgan = (ma) => layNgonNgu(ma).tenNgan;
/** Kiểu phiên âm của ngôn ngữ ('pinyin' | 'furigana' | 'romaja' | null). */
export const phienAm = (ma) => layNgonNgu(ma).phienAm;

export const tenChoPrompt = (ma) => layNgonNgu(ma).tenPrompt;
export const bcp47 = (ma) => layNgonNgu(ma).bcp47;
export const donViDem = (ma) => layNgonNgu(ma).donViDem;
export const tenViet = (ma) => layNgonNgu(ma).tenViet;
/** Tên giữa câu: 'tiếng Trung' (chỉ hạ chữ đầu, giữ hoa tên riêng). */
export const tenVietGiuaCau = (ma) => tenViet(ma).replace(/^./, (c) => c.toLowerCase());

/**
 * Lựa chọn cho ô chọn NGÔN NGỮ HỌC — sinh từ sổ: bật một ngôn ngữ (`hoatDong: true`) là nó tự hiện
 * ở mọi ô chọn. Chế độ song ngữ 'bi' không phải ngôn ngữ nên các ô tự thêm riêng.
 */
export const luaChonNgonNguHoc = () => NGON_NGU_HOAT_DONG.map((ma) => {
    const n = layNgonNgu(ma);
    return { ma, co: n.co || '', tenViet: n.tenViet };
});
