/**
 * Mở ngăn Công thức ngữ pháp từ bất kỳ đâu mà không rời màn đang làm, và nối lỗi/khung câu
 * với đúng mục ngữ pháp. Mọi id ở đây được test đối chiếu với kho lõi ở backend.
 */
export const SU_KIEN_NGU_PHAP = 'levelup:ngu-phap';

/** Mở ngăn: `{ id }` mở một mục, `{ nhom }` lọc theo nhóm, không truyền thì mở để tìm. */
export function moNguPhap(dich = {}) {
    window.dispatchEvent(new CustomEvent(SU_KIEN_NGU_PHAP, { detail: dich }));
}

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

/** Khung câu của Phản xạ câu → mục ngữ pháp. */
export const NGU_PHAP_THEO_KHUNG = {
    'khung-cau': { id: 'there-is-are' },
    'qua-khu': { id: 'qua-khu-don' },
    'tell-say-talk': { id: 'tell-say-talk' },
    'mau-giao-tiep': { id: 'modal' },
};
