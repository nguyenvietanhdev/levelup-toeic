import { chuanMa, tenNgan } from '@lib/ngonNgu.js';
/**
 * Luyện lại một bài dịch đã làm, từ tab Lịch sử — không gọi AI sinh đề.
 *
 * Bài đã chấm có sẵn ĐOẠN GỐC và BẢN DỊCH THAM KHẢO, nên:
 *   · luyện lại cùng chiều: dùng lại đoạn gốc;
 *   · đổi chiều: bản tham khảo thành đề, dịch theo chiều ngược lại (bài Việt → Anh thì đề tiếng
 *     Anh dịch sang Việt, và ngược lại). Cùng một nội dung, luyện cả viết lẫn đọc hiểu.
 */

const doi = (c) => (c === 'ngoai-vi' ? 'vi-ngoai' : 'ngoai-vi');

/** Đề để luyện lại (thuần). Không có nội dung để làm đề (bài cũ thiếu bản tham khảo) thì null. */
export function deLuyenLai(bai, doiChieu = false) {
    if (!bai) return null;
    const chieuCu = bai.chieu === 'ngoai-vi' ? 'ngoai-vi' : 'vi-ngoai';
    const chieu = doiChieu ? doi(chieuCu) : chieuCu;
    const passage = String((doiChieu ? bai.reference : bai.passage) || '').trim();
    if (!passage) return null;
    const lang = chuanMa(bai.lang);
    return {
        chieu,
        passage,
        topic: bai.topic || '',
        words: Array.isArray(bai.words) ? bai.words : [],
        level: bai.level || 'medium',
        lang,
        // Cùng ngưỡng với server (translationGrader.limitsFor).
        minUnits: chieu === 'ngoai-vi' ? 15 : (lang === 'zh' ? 20 : 15),
        luyenLai: doiChieu ? 'doi-chieu' : 'lai',
    };
}

/** Nhãn chiều cho nút (thuần): "Việt → Anh" / "Trung → Việt"… */
export function nhanChieu(chieu, lang) {
    const ten = tenNgan(lang);
    return chieu === 'ngoai-vi' ? `${ten} → Việt` : `Việt → ${ten}`;
}

export { doi as doiChieu };
