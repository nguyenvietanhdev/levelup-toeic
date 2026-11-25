/**
 * Kho từ vựng CHUNG của một ngôn ngữ — tên kho lấy từ sổ ngôn ngữ (config/ngonNgu.json), thay cho
 * các ternary `lang === 'zh' ? VocabularyZh : Vocabulary` rải ở nhiều nơi. Thêm ngôn ngữ có kho
 * riêng: khai `kho` + `truongDauMuc` trong sổ và thêm model vào `NAP`.
 *
 * Nạp model LƯỜI (khi gọi): test giả lập model bằng jest.mock vẫn nhận đúng bản giả.
 */
const { layNgonNgu, chuanMa } = require('../config/ngonNgu');

const NAP = {
    Vocabulary: () => require('../models/Vocabulary'),
    VocabularyZh: () => require('../models/VocabularyZh'),
    VocabularyBi: () => require('../models/VocabularyBi'),
};

/**
 * Model kho chung của `lang`. `coBi`: nhận 'bi' là kho song ngữ Trung–Anh (chỉ nơi nào vốn phân
 * biệt kho song ngữ); không thì 'bi' và mã lạ/chưa mở chuẩn về ngôn ngữ mặc định như trước.
 */
function khoTuVung(lang, { coBi = false } = {}) {
    if (coBi && lang === 'bi') return NAP.VocabularyBi();
    const n = layNgonNgu(chuanMa(lang));
    // Ngôn ngữ đã mở mà chưa khai kho (hoặc chưa thêm model vào NAP): báo rõ, đừng để lỗi khó hiểu.
    if (!n.kho || !NAP[n.kho]) throw new Error(`Ngôn ngữ "${n.ma}" chưa có kho từ vựng (khai "kho" trong config/ngonNgu.json và thêm model vào NAP).`);
    return NAP[n.kho]();
}

/** Trường lưu mặt chữ chính của từ trong kho của `lang` ('en' | 'zh'). */
const truongDauMuc = (lang) => layNgonNgu(chuanMa(lang)).truongDauMuc;

module.exports = { khoTuVung, truongDauMuc };
