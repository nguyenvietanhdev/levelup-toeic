// Thời gian mỗi câu (giây) theo TỪNG chế độ luyện tập.
// Người dùng chỉnh trong Cài đặt → Luyện tập; lưu ở settings.questionTime dạng
// { [modeId]: seconds }. Không có override → dùng def của mode.
//
// Tương thích ngược: settings.timePerQuestion (số, dùng chung mọi chế độ) vẫn được
// tôn trọng làm mức nền nếu chưa có override riêng — người dùng cũ không bị đổi hành vi.
import { GameState } from '@game/state.js';

// Mặc định theo độ nặng của thao tác: chọn đáp án nhanh hơn gõ/nghe.
export const QUESTION_TIME_MODES = [
    { id: 'multiple-choice',    name: 'Trắc nghiệm',    def: 20 },
    { id: 'fill-blank',         name: 'Điền từ',        def: 30 },
    { id: 'example-fill-blank', name: 'Điền vào câu',   def: 40 },
    { id: 'listening',          name: 'Nghe và chọn',   def: 25 },
    { id: 'synonym-check',      name: 'Từ đồng nghĩa',  def: 25 },
    { id: 'word-type-check',    name: 'Từ loại',        def: 20 },
    { id: 'phonetic-quiz',      name: 'Đọc phiên âm',   def: 25 },
    { id: 'review-mistakes',    name: 'Ôn lại từ sai',  def: 30 },
    { id: 'sentence-listening', name: 'Nghe chuỗi từ',  def: 40 },
];

const DEFAULTS = Object.fromEntries(QUESTION_TIME_MODES.map(m => [m.id, m.def]));
const FALLBACK = 30;

/** Mặc định của một chế độ (dùng cho danh sách trong Cài đặt). */
export function getQuestionTimeDefault(mode) {
    return DEFAULTS[mode] ?? FALLBACK;
}

/** Thời gian mỗi câu (giây) đang áp dụng cho một chế độ. */
export function getQuestionTime(mode) {
    const s = GameState.state?.settings || {};
    const v = s.questionTime?.[mode];
    if (typeof v === 'number' && v > 0) return v;
    // Giá trị cũ (một số dùng chung) — giữ cho người dùng cũ không bị đổi đột ngột.
    if (typeof s.timePerQuestion === 'number' && s.timePerQuestion > 0) return s.timePerQuestion;
    return getQuestionTimeDefault(mode);
}
