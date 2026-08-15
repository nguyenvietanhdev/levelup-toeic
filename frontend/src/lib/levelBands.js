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

/** Mức HSK gộp vào nhóm nào — khớp với `toBand()` bên backend. */
const HSK_BANDS = {
    easy: ['HSK1', 'HSK2'],
    medium: ['HSK3', 'HSK4'],
    hard: ['HSK5', 'HSK6', 'HSK7-9'],
    adaptive: null,
};

const CEFR_BANDS = {
    easy: ['A1', 'A2'],
    medium: ['B1', 'B2'],
    hard: ['C1', 'C2'],
    adaptive: null,
};

/**
 * Danh sách `level` ứng với một mức độ khó, theo ngôn ngữ đang học.
 *
 * @param {'easy'|'medium'|'hard'|'adaptive'} band
 * @param {'en'|'zh'} lang
 * @returns {string[]|null} `null` = không lọc (lấy toàn bộ)
 */
export function levelsFor(band, lang) {
    const table = lang === 'zh' ? HSK_BANDS : CEFR_BANDS;
    return table[band] ?? null;
}

/** Nhãn ngắn hiện trên ô chọn — kèm khung tương ứng để người học biết mình đang ở đâu. */
export function bandLabel(band, lang) {
    const isZh = lang === 'zh';
    switch (band) {
        case 'easy':   return isZh ? 'Dễ (HSK1-2)' : 'Dễ (A1-A2)';
        case 'medium': return isZh ? 'Trung bình (HSK3-4)' : 'Trung bình (B1-B2)';
        case 'hard':   return isZh ? 'Khó (HSK5-9)' : 'Khó (C1-C2)';
        default:       return 'Toàn bộ';
    }
}

/** Ba mức + "Toàn bộ", dùng để dựng <option> mà không chép nhãn ra từng file. */
export const BANDS = ['easy', 'medium', 'hard', 'adaptive'];
