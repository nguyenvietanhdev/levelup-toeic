// Xử lý HẾT GIỜ một câu — dùng chung cho 9 chế độ hỏi–đáp.
// Theo thiết kế đã chốt: hết giờ mà chưa trả lời thì câu đó TÍNH SAI
// (vào thống kê + "Ôn lại từ sai"), hiện đáp án đúng, rồi:
//   • Tự động chuyển câu BẬT  → chuyển sang câu kế (afterAnswer lo độ trễ)
//   • Tự động chuyển câu TẮT  → khoá câu, chờ người dùng bấm "Tiếp →"
import { PracticeManager } from './practiceManager.js';
import { afterAnswer } from './practiceNav.js';
import { Notification } from '@ui/Toaster.jsx';

let warned = false;

/**
 * @param {object} modeObj   đối tượng chế độ (this)
 * @param {string} modeId    id chế độ, để afterAnswer lấy đúng độ trễ
 * @param {object} opts
 *   selector      CSS chọn các nút/ô cần khoá (mặc định '.choice-btn')
 *   correctIndex  vị trí đáp án đúng → gắn class 'correct'
 *   reveal        hàm tuỳ biến để hiện đáp án (nhận NodeList đã khoá)
 *   word          từ vựng để ghi nhận câu SAI
 */
export function timeoutQuestion(modeObj, modeId, { selector = '.choice-btn', correctIndex, reveal, word } = {}) {
    const nodes = document.querySelectorAll(selector);
    nodes.forEach(n => { n.disabled = true; });

    if (typeof reveal === 'function') reveal(nodes);
    else if (typeof correctIndex === 'number') nodes[correctIndex]?.classList.add('correct');

    if (word) PracticeManager.recordAnswer(false, word);

    // Báo một lần mỗi lượt cho đỡ ồn.
    if (!warned) {
        warned = true;
        Notification.show({ type: 'warning', title: '⏰ Hết giờ câu này', message: 'Câu này tính là sai', duration: 2000 });
        setTimeout(() => { warned = false; }, 5000);
    }

    afterAnswer(modeObj, modeId);
}
