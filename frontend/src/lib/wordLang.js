import { bcp47 } from './ngonNgu.js';
import { NGON_NGU_HOAT_DONG, nhanDienChuViet } from '@lib/ngonNgu.js';
// Xác định ngôn ngữ của một từ trong bộ "Từ vựng riêng".
//
// Bộ này trộn lẫn Anh–Trung: gõ `你会吗` vào ô Dịch nhanh rồi lưu thì chữ Hán
// nằm trong trường `en`, ngay cạnh những từ tiếng Anh thật. Đọc bằng giọng sai
// là ra một tràng vô nghĩa — mà không có lỗi nào, chỉ có âm thanh kỳ quặc.
//
// Từ lưu MỚI có trường `lang` (backend ghi từ lúc bấm Thêm). Từ CŨ thì không —
// nên phải đoán bằng mặt chữ. Đoán ở đây an toàn vì chỉ có hai khả năng và chữ
// Hán không bao giờ xuất hiện trong một từ tiếng Anh thật.

/** Có ít nhất một chữ Hán không? */
export function hasHanzi(text) {
    return /[一-鿿㐀-䶿]/.test(String(text || ''));
}

/**
 * Ngôn ngữ của trường `en` trong một bản ghi từ vựng riêng.
 *
 * Ưu tiên `lang` đã lưu; không có thì nhìn mặt chữ. Trả 'zh' hoặc 'en'.
 */
export function wordLang(word) {
    if (NGON_NGU_HOAT_DONG.includes(word?.lang)) return word.lang;
    // Kana / Hangul nói lên tiếng Nhật / Hàn (sổ ngôn ngữ) khi ngôn ngữ đó đã mở.
    const theoChu = nhanDienChuViet(word?.en);
    if (theoChu && theoChu !== 'zh' && NGON_NGU_HOAT_DONG.includes(theoChu)) return theoChu;
    return hasHanzi(word?.en) ? 'zh' : 'en';
}

/** Mã giọng đọc cho Web Speech / TTS. */
export function ttsLangOf(word) {
    return bcp47(wordLang(word));
}
