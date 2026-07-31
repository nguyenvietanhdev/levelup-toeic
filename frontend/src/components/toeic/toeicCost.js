// Chi phí năng lượng bài TOEIC — PHẢI khớp backend/controllers/toeicController.js.
// Chỉ để HIỂN THỊ trước cho người dùng; server mới là nơi trừ thật (chống cheat).
const PER_Q = 0.6;
const MIN = 5;
const MAX = 60;

export function toeicEnergyCost(totalQuestions) {
    const raw = Math.round((totalQuestions || 0) * PER_Q);
    return Math.min(MAX, Math.max(MIN, raw));
}
