// Cử chỉ "GIỮ phím để bật, thả ra thì tắt" (push-to-talk).
//
// Vì sao cần cả một máy trạng thái cho một việc nghe đơn giản: phím Shift đồng
// thời là phím GÕ CHỮ HOA. Bật micro ngay khi Shift vừa chạm xuống thì gõ chữ "T"
// hoa trong "TOEIC" cũng bật micro — mỗi lần viết hoa là một lần máy nghe lén.
//
// Hai lớp chặn:
//   1. NGƯỠNG GIỮ — phải giữ đủ lâu (mặc định 350ms) mới tính là có ý định. Nhấn
//      nhả nhanh để gõ hoa thì không chạm tới ngưỡng.
//   2. HUỶ KHI CÓ PHÍM KHÁC — đang đếm ngưỡng mà người dùng bấm phím khác thì rõ
//      ràng họ đang gõ, không phải muốn nói. Huỷ ngay.
//
// Nhờ (2) mà `Shift+Enter` (dịch nhanh) vẫn dùng được bình thường: Enter rơi vào
// lúc chưa hết ngưỡng nên cử chỉ bị huỷ, không có micro nào bật lên.
//
// Không đụng tới DOM để test được bằng fake timer.

/**
 * @param {object} opts
 *   thresholdMs  giữ bao lâu thì tính là cố ý (mặc định 350)
 *   onStart      gọi khi cử chỉ được kích hoạt
 *   onStop       gọi khi thả phím ra (chỉ khi đã kích hoạt)
 *   setTimer/clearTimer  tiêm vào cho test; mặc định dùng của window
 */
export function createHoldGesture({
    thresholdMs = 350,
    onStart,
    onStop,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
} = {}) {
    let timer = null;
    let active = false;     // đã kích hoạt (đã qua ngưỡng, chưa thả)
    let pressed = false;    // phím đang được giữ

    function cancelPending() {
        if (timer !== null) { clearTimer(timer); timer = null; }
    }

    return {
        /** Phím cử chỉ vừa nhấn xuống. Bỏ qua auto-repeat của bàn phím. */
        keyDown({ repeat = false } = {}) {
            if (repeat || pressed || active) return;
            pressed = true;
            timer = setTimer(() => {
                timer = null;
                active = true;
                onStart?.();
            }, thresholdMs);
        },

        /** Phím cử chỉ vừa thả ra. */
        keyUp() {
            cancelPending();
            pressed = false;
            if (!active) return;
            active = false;
            onStop?.();
        },

        /**
         * Một phím KHÁC vừa được bấm. Đang chờ ngưỡng thì huỷ (người dùng đang gõ);
         * đã kích hoạt rồi thì dừng luôn, để tổ hợp phím kia chạy bình thường.
         */
        otherKeyDown() {
            cancelPending();
            if (!active) { pressed = false; return; }
            active = false;
            pressed = false;
            onStop?.();
        },

        /** Bỏ hết trạng thái mà KHÔNG gọi onStop — dùng khi rời trang / mất focus. */
        reset() {
            cancelPending();
            pressed = false;
            active = false;
        },

        isActive: () => active,
    };
}
