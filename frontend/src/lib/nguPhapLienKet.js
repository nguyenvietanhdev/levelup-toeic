/**
 * Mở ngăn Công thức ngữ pháp từ bất kỳ đâu mà không rời màn đang làm, và nối lỗi/khung câu
 * với đúng mục ngữ pháp. Mọi id ở đây được test đối chiếu với kho lõi ở backend.
 */
export const SU_KIEN_NGU_PHAP = 'levelup:ngu-phap';

/** Mở ngăn: `{ id }` mở một mục, `{ nhom }` lọc theo nhóm, không truyền thì mở để tìm. */
export function moNguPhap(dich = {}) {
    window.dispatchEvent(new CustomEvent(SU_KIEN_NGU_PHAP, { detail: dich }));
}

import { getVocabLang } from '@api/vocabulary.js';

/** Nhóm lỗi → nơi cần xem. Lỗi không gắn được với một công thức thì không có lối vào. */
export const NGU_PHAP_THEO_LOI = {
    article: { id: 'mao-tu' },
    tense: { nhom: 'thi' },
    agreement: { id: 'hien-tai-don' },
    preposition: { nhom: 'gioi-lien' },
    'word-order': { id: 'cau-hoi-wh' },
    'literal-translation': { nhom: 'cau-truc' },
    pronoun: { id: 'dai-tu' },
    plural: { id: 'dem-duoc' },
};

/** Như trên, cho lỗi trong bài tiếng Trung — trỏ vào kho tiếng Trung (`zh-…`). */
export const NGU_PHAP_THEO_LOI_ZH = {
    'measure-word': { id: 'zh-luong-tu' },
    aspect: { id: 'zh-le' },
    negation: { id: 'zh-bu-mei' },
    'particle-de': { id: 'zh-de' },
    complement: { id: 'zh-bo-ngu-ket-qua' },
    'ba-bei': { id: 'zh-ba' },
    comparison: { id: 'zh-bi' },
    'word-order': { id: 'zh-trat-tu' },
    'literal-translation': { id: 'zh-trat-tu' },
};

/**
 * Nơi cần xem cho một nhóm lỗi, theo ngôn ngữ của bài; không có thì `null`.
 * Mặc định là ngôn ngữ đang học (cùng quy ước với backend: chỉ `zh` là tiếng Trung).
 * Kèm `lang` để ngăn ngữ pháp mở đúng thư viện, kể cả khi chỉ lọc theo nhóm.
 */
export function nguPhapChoLoi(key, lang = getVocabLang() === 'zh' ? 'zh' : 'en') {
    const zh = lang === 'zh';
    const dich = (zh ? NGU_PHAP_THEO_LOI_ZH : NGU_PHAP_THEO_LOI)[key];
    return dich ? { ...dich, lang: zh ? 'zh' : 'en' } : null;
}

/** Khung câu của Phản xạ câu → mục ngữ pháp. */
export const NGU_PHAP_THEO_KHUNG = {
    'khung-cau': { id: 'there-is-are' },
    'qua-khu': { id: 'qua-khu-don' },
    'tell-say-talk': { id: 'tell-say-talk' },
    'mau-giao-tiep': { id: 'modal' },
    // Tiếng Trung
    'zh-trat-tu': { id: 'zh-trat-tu' },
    'zh-da-lam': { id: 'zh-le' },
    'zh-luong-tu': { id: 'zh-luong-tu' },
    'zh-giao-tiep': { id: 'zh-nang-nguyen' },
};
