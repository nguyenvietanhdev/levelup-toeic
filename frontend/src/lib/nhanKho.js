/**
 * Tên và mã giọng của HAI MẶT trong một kho từ vựng.
 *
 * Module LÁ — không import gì cả. Đó là chủ ý: `gameLogic` cần bảng này để đặt
 * câu hỏi ("Từ tiếng Trung của từ trên là:"), mà `nhanNgonNgu.js` lại import
 * `vocabLang` TỪ `gameLogic`. Để bảng ở một trong hai chỗ đó là vòng import.
 *
 * Nhận `kho` làm THAM SỐ thay vì tự đọc trạng thái, nên chạy được ở cả hai bên
 * và test được mà không cần dựng gì.
 *
 * ── Vì sao phải có bảng này ────────────────────────────────────────────────
 * Câu hỏi viết cứng "tiếng Anh" / "tiếng Việt" là di sản hồi app chỉ có một
 * kho. Từ khi có kho `zh` và `bi`, những câu đó sai hẳn:
 *   · kho `zh` — mặt hỏi là chữ HÁN, mà form vẫn ghi "Từ tiếng Anh của từ
 *     trên là:";
 *   · kho `bi` — KHÔNG có tiếng Việt ở đâu cả, mà form vẫn hỏi "Nghĩa tiếng
 *     Việt của từ trên là:".
 * Người học đọc một đằng, phải gõ một nẻo.
 */

/** @typedef {'en'|'zh'|'bi'} Kho */

/**
 * Tên hai mặt của một kho.
 *
 * @param {Kho} kho
 * @returns {{tu: string, nghia: string}} `tu` = mặt hỏi, `nghia` = mặt đáp.
 */
export function nhanKho(kho) {
    // Kho song ngữ học Trung ↔ Anh, không qua tiếng Việt.
    if (kho === 'bi') return { tu: 'Tiếng Trung', nghia: 'Tiếng Anh' };
    if (kho === 'zh') return { tu: 'Tiếng Trung', nghia: 'Tiếng Việt' };
    return { tu: 'Tiếng Anh', nghia: 'Tiếng Việt' };
}

/**
 * Tên hai mặt viết THƯỜNG — để ghép vào giữa câu.
 *
 * "Nhập Tiếng Trung" đọc gợn; "Nhập từ tiếng Trung" mới xuôi. Có sẵn bản
 * thường thì chỗ gọi khỏi tự `toLowerCase()` mỗi nơi một kiểu.
 *
 * @param {Kho} kho
 * @returns {{tu: string, nghia: string}}
 */
export function nhanKhoThuong(kho) {
    const n = nhanKho(kho);
    return { tu: n.tu.toLowerCase(), nghia: n.nghia.toLowerCase() };
}

/**
 * Mã giọng đọc (BCP-47) của hai mặt.
 *
 * `word` tuỳ chọn: kho song ngữ chứa cả hai chiều (`hienThi` của TỪNG bản ghi),
 * nên hỏi "kho này mặt trước là gì" là câu hỏi sai — mapper đã tính sẵn
 * `ttsLang` cho bản ghi đó.
 *
 * @param {Kho} kho
 * @param {{ttsLang?: string}|null} [word]
 * @returns {{tu: string, nghia: string}}
 */
export function maKho(kho, word = null) {
    if (kho === 'bi') {
        const tu = word?.ttsLang === 'en-US' ? 'en-US' : 'zh-CN';
        return { tu, nghia: tu === 'zh-CN' ? 'en-US' : 'zh-CN' };
    }
    if (kho === 'zh') return { tu: 'zh-CN', nghia: 'vi-VN' };
    return { tu: 'en-US', nghia: 'vi-VN' };
}
