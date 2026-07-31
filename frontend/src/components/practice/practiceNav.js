// Điều hướng sau khi trả lời: tự động chuyển câu (auto) hoặc thủ công (nút
// ← Trước / Tiếp → + phím mũi tên). Bật/tắt qua settings.autoAdvance.
import { GameState } from '@game/state.js';
import { getTransitionDelay } from './transitionDelay.js';
import { stopQuestionTimer } from './questionTimer.js';

let navMode = null;      // mode đang hiển thị thanh điều hướng thủ công
let keyBound = false;    // đã gắn listener bàn phím chưa

export function isAutoAdvance() {
    return GameState.state?.settings?.autoAdvance !== false;
}

// Gọi sau khi user trả lời xong 1 câu. modeObj cần: currentIndex, showQuestion(), nextQuestion().
export function afterAnswer(modeObj, modeId) {
    // Câu này xong rồi → dừng đếm ngược, tránh "hết giờ" nổ trong lúc chờ chuyển câu.
    stopQuestionTimer();
    if (isAutoAdvance()) {
        setTimeout(() => modeObj.nextQuestion(), getTransitionDelay(modeId));
        return;
    }
    renderNavBar(modeObj);
}

function goPrev() {
    if (navMode && navMode.currentIndex > 0) {
        navMode.currentIndex--;
        navMode.showQuestion();
        // showQuestion() bật lại đồng hồ, nhưng câu lùi về ĐÃ trả lời rồi —
        // để chạy tiếp thì hết giờ sẽ tính SAI lần hai. Dừng ngay.
        stopQuestionTimer();
        renderNavBar(navMode); // giữ thanh điều hướng ở câu vừa lùi tới
    }
}

function goNext() {
    if (!navMode) return;
    navMode.nextQuestion();
    // Còn trong lượt (chưa hoàn thành) → giữ thanh điều hướng.
    if (navMode.currentIndex < (navMode.questions?.length || 0)) {
        renderNavBar(navMode);
    }
}

function onKey(e) {
    // Chỉ khi đang ở chế độ thủ công (thanh nav tồn tại) và không gõ trong ô nhập.
    if (!navMode || !document.querySelector('.practice-nav-bar')) return;
    const tag = (e.target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
}

function renderNavBar(modeObj) {
    const container = document.getElementById('practice-content');
    if (!container) return;
    container.querySelector('.practice-nav-bar')?.remove();

    navMode = modeObj;
    if (!keyBound) { document.addEventListener('keydown', onKey); keyBound = true; }

    const atStart = (modeObj.currentIndex || 0) <= 0;
    const bar = document.createElement('div');
    bar.className = 'practice-nav-bar';
    bar.innerHTML = `
        <button class="practice-nav-btn" data-nav="prev"${atStart ? ' disabled' : ''}>
            <i class="fas fa-chevron-left"></i> Trước
        </button>
        <button class="practice-nav-btn primary" data-nav="next">
            Tiếp <i class="fas fa-chevron-right"></i>
        </button>`;
    container.appendChild(bar);

    bar.querySelector('[data-nav="prev"]')?.addEventListener('click', goPrev);
    bar.querySelector('[data-nav="next"]')?.addEventListener('click', goNext);
}
