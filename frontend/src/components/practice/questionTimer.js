// Đồng hồ đếm ngược cho TỪNG CÂU (9 chế độ hỏi–đáp).
// Trước đây chỉ có MỘT đồng hồ cho cả lượt và hết giờ là kết thúc lượt; nay mỗi
// câu có đồng hồ riêng, hết giờ chỉ kết thúc câu đó (tính SAI rồi chuyển/khoá).
//
// Module đứng riêng để tránh vòng import: practiceManager → modes → practiceNav.
// Chỉ phụ thuộc GameState + questionTime.
import { GameState } from '@game/state.js';
import { getQuestionTime } from './questionTime.js';

let interval = null;
let remaining = 0;
let onExpire = null;

function isEnabled() {
    return GameState.state?.settings?.timeLimitEnabled !== false;
}

// Vẽ đồng hồ. PHẢI qua _reactSetPracticeTimer: ô <span id="practice-timer"> render
// từ state React, ghi thẳng textContent sẽ bị React xoá mỗi lần re-render (đổi điểm,
// đổi tiến độ sau mỗi câu) → đồng hồ nhảy về 00:00.
function render(hide = false) {
    window._reactSetTimerVisible?.(!hide);
    if (hide) return;
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    window._reactSetPracticeTimer?.(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    // Class cảnh báo React không quản → vẫn set trực tiếp.
    const el = document.getElementById('practice-timer');
    if (!el) return;
    el.classList.toggle('timer-warning', remaining <= 10 && remaining > 5);
    el.classList.toggle('timer-critical', remaining <= 5 && remaining > 0);
}

function tick() {
    remaining--;
    render();
    if (remaining <= 0) {
        stopQuestionTimer();
        const cb = onExpire;
        onExpire = null;
        cb?.();
    }
}

/**
 * Bắt đầu đếm ngược cho MỘT câu. Gọi ở cuối showQuestion() của mỗi chế độ.
 * @param {string} modeId  id chế độ (lấy số giây theo cài đặt từng chế độ)
 * @param {Function} expireCb  gọi khi hết giờ mà chưa trả lời
 */
export function startQuestionTimer(modeId, expireCb) {
    stopQuestionTimer();
    if (!isEnabled()) { render(true); return; }
    remaining = getQuestionTime(modeId);
    onExpire = expireCb;
    render();
    interval = setInterval(tick, 1000);
}

/** Dừng đồng hồ (đã trả lời / rời chế độ). */
export function stopQuestionTimer() {
    if (interval) { clearInterval(interval); interval = null; }
    onExpire = null;
}

export function isQuestionTimerRunning() {
    return !!interval;
}

/** Đóng băng đồng hồ câu trong `ms` mili-giây (vật phẩm dừng thời gian). */
export function freezeQuestionTimer(ms = 10000) {
    if (!interval) return false;
    clearInterval(interval);
    interval = null;
    const el = document.getElementById('practice-timer');
    el?.classList.add('timer-frozen');
    setTimeout(() => {
        el?.classList.remove('timer-frozen');
        // Chỉ chạy lại nếu chưa sang câu khác (onExpire còn nguyên).
        if (onExpire && !interval) interval = setInterval(tick, 1000);
    }, ms);
    return true;
}
