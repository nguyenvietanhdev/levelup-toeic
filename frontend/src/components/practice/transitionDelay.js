// Thời gian chuyển câu (auto-advance) cho các chế độ hỏi–đáp.
// Người dùng chỉnh trong Cài đặt → Luyện tập; lưu ở settings.questionTransition
// dạng { [modeId]: ms }. Không có override → dùng def của mode.
import { GameState } from '@game/state.js';

// Chỉ gồm các chế độ có delay chuyển câu rõ ràng. Chế độ Tốc độ và Phát âm
// không nằm đây: Tốc độ vốn là chạy đua với đồng hồ, còn Phát âm chờ người dùng
// bấm mic nên không có nhịp "trả lời xong" cố định.
export const TRANSITION_MODES = [
    { id: 'multiple-choice',    name: 'Trắc nghiệm',   def: 1000 },
    { id: 'fill-blank',         name: 'Điền từ',       def: 1200 },
    { id: 'example-fill-blank', name: 'Điền vào câu',  def: 2500 },
    { id: 'listening',          name: 'Nghe và chọn',  def: 1200 },
    { id: 'synonym-check',      name: 'Từ đồng nghĩa', def: 1500 },
    { id: 'word-type-check',    name: 'Từ loại',       def: 1500 },
    { id: 'phonetic-quiz',      name: 'Đọc phiên âm',  def: 1500 },
    { id: 'review-mistakes',    name: 'Ôn lại từ sai', def: 2500 },
    { id: 'sentence-listening', name: 'Nghe chuỗi từ', def: 2500 },
    // Ba chế độ dưới đây trước KHÔNG có trong bảng, và cũng không dùng
    // `afterAnswer` — chúng tự `setTimeout` rồi chuyển câu, nên cài đặt "Tự động
    // chuyển câu" tắt đi mà chúng vẫn tự chuyển. Giữ NGUYÊN thời gian cũ của
    // từng cái làm mặc định: người đang quen nhịp nào thì vẫn nhịp đó.
    { id: 'context-learning',   name: 'Hiểu qua câu',  def: 2000 },
    { id: 'sentence-builder',   name: 'Xếp câu',       def: 3500 },
    { id: 'hanzi-writing',      name: 'Viết chữ Hán',  def: 1200 },
];

const DEFAULTS = Object.fromEntries(TRANSITION_MODES.map(m => [m.id, m.def]));

/** Thời gian chuyển câu (ms) cho một chế độ — override của người dùng hoặc def. */
export function getTransitionDelay(mode) {
    const qt = GameState.state?.settings?.questionTransition || {};
    const v = qt[mode];
    return (typeof v === 'number' && v >= 0) ? v : (DEFAULTS[mode] ?? 1200);
}

/** Giá trị mặc định của một chế độ (dùng cho danh sách review). */
export function getTransitionDefault(mode) {
    return DEFAULTS[mode] ?? 1200;
}
