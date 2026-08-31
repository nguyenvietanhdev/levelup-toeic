/**
 * Đang phát tiếng thì KHÔNG bấm được nút âm thanh nào nữa.
 *
 * ── VÌ SAO ──────────────────────────────────────────────────────────────────
 * Bấm nút loa mười lần liên tiếp thì mỗi lần huỷ lượt đang phát rồi bắt đầu
 * lượt mới — nghe ra một chuỗi tiếng cụt, và mỗi lượt là một lần gọi tổng hợp.
 * Nút mic còn tệ hơn: ở chế độ phát âm, bấm loa rồi bấm mic ngay là máy ghi lại
 * chính tiếng loa của mình và chấm điểm trên đó.
 *
 * ── VÌ SAO LÀM Ở ĐÂY, KHÔNG SỬA TỪNG CHẾ ĐỘ ─────────────────────────────────
 * Có 17 nút âm thanh rải trong 13 chế độ. Vá từng chỗ thì mỗi nút mới thêm vào
 * là một chỗ hở, mà không có gì nhắc. Chặn ở tầng sự kiện thì một lần là xong,
 * kể cả cho nút chưa viết.
 *
 * ── CÁCH NHẬN RA NÚT ÂM THANH ───────────────────────────────────────────────
 * Bằng lớp `js-nut-am` gắn tay, KHÔNG bằng `.btn-speak-mini`: lớp đó dùng chung
 * cho cả nút DỊCH (`rs-translate`, `card-translate`, nút dịch trong khối ví dụ).
 * Chặn nhầm nút dịch thì đang nghe là không tra được nghĩa — trong khi hai việc
 * đó chẳng liên quan gì nhau.
 *
 * ── CHẶN Ở PHA BẮT (capture) ────────────────────────────────────────────────
 * Handler của các chế độ gắn ở pha nổi bọt. Chặn ở pha bắt là ta chạy TRƯỚC,
 * nên `stopPropagation` chặn được thật. Gắn ở pha nổi bọt thì handler kia đã
 * chạy xong rồi mới tới lượt mình.
 */

/** Lớp đánh trên `<body>` khi đang phát — CSS bám vào để làm mờ nút. */
const LOP_DANG_PHAT = 'dang-phat-am';

/** Nút nào chịu luật này. */
const CHON_NUT = '.js-nut-am';

/**
 * Tự mở khoá sau bao lâu nếu không ai báo đã phát xong (ms).
 *
 * Lưới an toàn bắt buộc: `onEnd` của gTTS KHÔNG bao giờ về khi lượt phát bị một
 * lượt sau chiếm chỗ, và trình duyệt còn chặn tự phát tiếng. Thiếu mốc này thì
 * mọi nút âm thanh khoá cứng cho tới khi tải lại trang.
 */
const TRAN_CHO = 15000;

/**
 * Số thứ tự lượt phát hiện tại. 0 = không phát gì.
 *
 * Dùng SỐ chứ không phải cờ đúng/sai: lượt cũ báo "xong" muộn sau khi lượt mới
 * đã bắt đầu thì nó mở khoá nhầm cho lượt đang chạy. So số thì lượt cũ tự biết
 * mình hết phiên và im lặng bỏ qua.
 */
let _luot = 0;
let _hen = null;
let _daGan = false;

/** Có đang phát tiếng không. */
export function dangPhatAm() {
    return _luot > 0;
}

function veTrangThai() {
    try {
        document.body?.classList.toggle(LOP_DANG_PHAT, _luot > 0);
    } catch { /* chưa có DOM (test, SSR) */ }
}

/**
 * Báo BẮT ĐẦU một lượt phát.
 *
 * @returns {number} thẻ của lượt này, truyền lại cho `ketThucPhat`.
 */
export function batDauPhat() {
    ganChanMotLan();
    _luot += 1;
    veTrangThai();

    clearTimeout(_hen);
    _hen = setTimeout(() => ketThucPhat(_luot), TRAN_CHO);
    // Đừng giữ tiến trình sống chỉ vì một hẹn giờ dọn dẹp.
    if (typeof _hen?.unref === 'function') _hen.unref();

    return _luot;
}

/**
 * Báo lượt phát đã xong.
 *
 * @param {number} the thẻ nhận từ `batDauPhat`. Không khớp = lượt cũ về muộn,
 *   bỏ qua. Truyền `null` để mở khoá BẤT KỂ lượt nào (dùng cho `stopSpeaking`).
 */
export function ketThucPhat(the = null) {
    if (the !== null && the !== _luot) return;
    _luot = 0;
    clearTimeout(_hen);
    _hen = null;
    veTrangThai();
}

/** Gắn bộ chặn đúng MỘT lần cho cả vòng đời trang. */
function ganChanMotLan() {
    if (_daGan) return;
    if (typeof document === 'undefined') return;
    _daGan = true;

    document.addEventListener('click', (e) => {
        if (!dangPhatAm()) return;
        const nut = e.target?.closest?.(CHON_NUT);
        if (!nut) return;
        // Chặn TRƯỚC khi handler của chế độ chạy.
        e.preventDefault();
        e.stopPropagation();
        // `stopImmediatePropagation` nữa: một nút có thể có nhiều handler gắn
        // cùng pha, `stopPropagation` không chặn được các handler anh em đó.
        e.stopImmediatePropagation?.();
    }, true);
}
