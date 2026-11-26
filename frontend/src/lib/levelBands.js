import SO from '@ngonNgu';
import { layNgonNgu, MAC_DINH } from '@lib/ngonNgu.js';
/**
 * Ba mức độ khó (Dễ · Trung bình · Khó) theo TỪNG KHUNG NGÔN NGỮ.
 *
 * Hệ thống dùng song song hai khung phân cấp:
 *   - Tiếng Anh: CEFR   A1 A2 · B1 B2 · C1 C2
 *   - Tiếng Trung: HSK  HSK1 HSK2 · HSK3 HSK4 · HSK5 HSK6 HSK7-9
 *
 * Bộ lọc so khớp CHÍNH XÁC từng chuỗi (`levelFilter.includes(w.level)`), nên
 * dùng bảng CEFR cho kho tiếng Trung là khớp 0 từ — chọn "Dễ" xong luyện tập
 * báo hết từ, mà không có lỗi nào chỉ ra vì sao.
 *
 * Gom về MỘT chỗ vì trước đây bảng này bị chép ở ba nơi (QuickSettings,
 * SettingsScreen, practiceManager) — sửa một chỗ là ba chỗ lệch nhau.
 */

/**
 * Thang cấp độ của từng ngôn ngữ (CEFR, HSK, JLPT, TOPIK) nằm ở sổ ngôn ngữ (`bacCapDo` trong
 * backend/config/ngonNgu.json): thêm ngôn ngữ là tự có thang, không sửa file này.
 */
const bangCua = (lang) => layNgonNgu(lang).bacCapDo || layNgonNgu(MAC_DINH).bacCapDo;

/** Cấp độ → nhóm A/B/C, dựng từ `bacCapDo` của mọi ngôn ngữ trong sổ ngôn ngữ. */
const NHOM_THEO_CAP = new Map(SO.ngonNgu.flatMap((n) => [['easy', 'A'], ['medium', 'B'], ['hard', 'C']]
    .flatMap(([band, nhom]) => (n.bacCapDo?.[band] || []).map((cap) => [String(cap).toUpperCase(), nhom]))));

/**
 * Quy một giá trị `level` bất kỳ về MỘT nhóm A / B / C.
 *
 * Bản frontend của `toBand()` bên backend (utils/levelStats.js) — giữ hai bản
 * khớp nhau, không thì dải màu trên thẻ Part và trên thẻ đề lệch nhau.
 *
 * Lấy chữ cái đầu là ĐỦ cho CEFR nhưng SAI cho HSK: "HSK1" ra chữ "H", không
 * rơi vào nhóm nào nên cả bộ từ mất dải phân bố độ khó mà không lỗi nào báo.
 * Đây đúng là lỗi đã gặp ở thẻ Part.
 *
 * @param {string} level
 * @returns {'A'|'B'|'C'|null}
 */
export function toBand(level) {
    const s = String(level == null ? '' : level).trim().toUpperCase();
    if (!s) return null;

    // Thang của mọi ngôn ngữ trong sổ (JLPT N5…N1, TOPIK1…6, HSK, CEFR): dễ → A, vừa → B, khó → C.
    const theoSo = NHOM_THEO_CAP.get(s);
    if (theoSo) return theoSo;

    // HSK phải xét TRƯỚC: nếu không, "HSK1" lọt xuống nhánh chữ cái đầu.
    // `HSK7-9` khớp chữ số đầu tiên là 7 → nhóm C, đúng như mong muốn.
    const hsk = s.match(/^HSK\s*-?\s*(\d)/);
    if (hsk) {
        const n = Number(hsk[1]);
        if (n <= 2) return 'A';
        if (n <= 4) return 'B';
        return 'C';          // HSK5, HSK6, HSK7-9
    }

    const first = s[0];
    return first === 'A' || first === 'B' || first === 'C' ? first : null;
}

/**
 * Danh sách `level` ứng với một mức độ khó, theo ngôn ngữ đang học.
 *
 * @param {'easy'|'medium'|'hard'|'adaptive'} band
 * @param {'en'|'zh'} lang
 * @returns {string[]|null} `null` = không lọc (lấy toàn bộ)
 */
export function levelsFor(band, lang) {
    return bangCua(lang)[band] ?? null;
}

/** Nhãn ngắn hiện trên ô chọn — kèm khung tương ứng để người học biết mình đang ở đâu. */
export function bandLabel(band, lang) {
    const nhan = bangCua(lang).nhan || {};
    switch (band) {
        case 'easy':   return `Dễ (${nhan.easy})`;
        case 'medium': return `Trung bình (${nhan.medium})`;
        case 'hard':   return `Khó (${nhan.hard})`;
        default:       return 'Toàn bộ';
    }
}

/** Ba mức + "Toàn bộ", dùng để dựng <option> mà không chép nhãn ra từng file. */
export const BANDS = ['easy', 'medium', 'hard', 'adaptive'];
