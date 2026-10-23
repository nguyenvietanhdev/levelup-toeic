/**
 * Kiểu chấm và độ khó dùng chung cho các chế độ AI (Hội thoại, Luyện viết, Dịch).
 *
 * Mọi màn lấy danh sách ở ĐÂY, không khai báo lại: để Hội thoại và các màn khác
 * luôn hiển thị giống nhau. Khoá khớp server:
 *   · kiểu chấm  → services/conversationGrader.js (hội thoại), services/essayGrader.js (viết)
 *   · mức chấm   → MUC_CHAM ở services/conversationGrader.js
 */

/** Kiểu chấm, kèm ngôn ngữ mà kiểu đó áp dụng được. */
export const KIEU_CHAM = [
    { key: 'giaotiep', label: 'Giao tiếp', desc: 'Rõ ý, tự nhiên, đúng ngữ cảnh', langs: ['en', 'zh', 'bi'] },
    { key: 'toeic', label: 'TOEIC', desc: 'Ngữ pháp, mạch lạc, vốn từ', langs: ['en', 'bi'] },
    { key: 'ielts', label: 'IELTS', desc: 'Mạch lạc, vốn từ, ngữ pháp', langs: ['en', 'bi'] },
    { key: 'hsk', label: 'HSK', desc: 'Từ vựng, ngữ pháp, lưu loát', langs: ['zh', 'bi'] },
];

/** Độ khó chung (Giao tiếp dùng trực tiếp). */
export const DO_KHO_CHUNG = [
    { key: 'easy', label: 'Dễ', desc: 'Từ thông dụng, câu ngắn' },
    { key: 'medium', label: 'Vừa', desc: 'Từ công sở' },
    { key: 'hard', label: 'Khó', desc: 'Từ ít gặp, câu phức' },
];

/**
 * Độ khó theo TỪNG kiểu chấm: mỗi kiểu có thang riêng (TOEIC điểm, IELTS band,
 * HSK cấp). Khoá easy/medium/hard giữ nguyên để gửi server.
 */
export const DO_KHO_THEO_KIEU = {
    giaotiep: DO_KHO_CHUNG,
    toeic: [
        { key: 'easy', label: '400–500', desc: 'Ngữ pháp cơ bản, từ công sở đơn giản' },
        { key: 'medium', label: '600–700', desc: 'Ngữ pháp đa dạng hơn' },
        { key: 'hard', label: '800+', desc: 'Vốn từ công sở phong phú' },
    ],
    ielts: [
        { key: 'easy', label: 'Band 5.0–5.5', desc: 'Ý rõ, đủ ngữ pháp' },
        { key: 'medium', label: 'Band 6.0–6.5', desc: 'Mạch lạc, từ đa dạng' },
        { key: 'hard', label: 'Band 7.0+', desc: 'Từ tinh tế, ít lỗi' },
    ],
    hsk: [
        { key: 'easy', label: 'HSK 2–3', desc: 'Câu đơn giản' },
        { key: 'medium', label: 'HSK 4', desc: 'Câu dài, bổ ngữ' },
        { key: 'hard', label: 'HSK 5+', desc: 'Câu phức, lưu loát' },
    ],
};

/** Các kiểu chấm áp dụng được cho một ngôn ngữ ('en' | 'zh' | 'bi'). */
export function kieuChoNgonNgu(lang) {
    return KIEU_CHAM.filter((k) => k.langs.includes(lang));
}

/** Độ khó hiển thị cho một kiểu chấm (rơi về Dễ/Vừa/Khó nếu kiểu lạ). */
export function doKhoChoKieu(kieu) {
    return DO_KHO_THEO_KIEU[kieu] || DO_KHO_CHUNG;
}
