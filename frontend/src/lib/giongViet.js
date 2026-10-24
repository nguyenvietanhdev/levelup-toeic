/**
 * Giọng TIẾNG VIỆT của trình duyệt (Web Speech API) — cho các đường dự phòng khi
 * máy chủ đọc (`/api/tts`) lỗi.
 *
 * Quy tắc RIÊNG cho tiếng Việt: không có giọng Việt thì KHÔNG đọc. Để trình duyệt
 * tự chọn thì nó dùng giọng mặc định — thường là giọng Anh — và đọc tiếng Việt
 * thành một tràng âm sai, còn tệ hơn im lặng vì người học tưởng đó là cách đọc.
 *
 * Danh sách giọng có thể RỖNG lúc trang vừa tải (trình duyệt nạp giọng không
 * đồng bộ) — khi đó coi như chưa có giọng Việt và không đọc.
 */

/** Mã ngôn ngữ có phải tiếng Việt không ('vi', 'vi-VN', 'vi_VN'…). */
export function laTiengViet(lang) {
    return /^vi([-_]|$)/i.test(String(lang || ''));
}

/** Giọng tiếng Việt đầu tiên của trình duyệt, hoặc null nếu chưa có. */
export function giongVietTrinhDuyet() {
    try {
        const voices = window.speechSynthesis?.getVoices?.() || [];
        return voices.find((v) => laTiengViet(v.lang)) || null;
    } catch {
        return null;
    }
}
