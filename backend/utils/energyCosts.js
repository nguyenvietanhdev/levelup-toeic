// ===================================
// ENERGY COSTS
// ===================================
// Giá năng lượng của mỗi chế độ luyện tập, và luật miễn trừ VIP.
//
// Vì sao có file này: `POST /api/practice/start` từng lấy `energyCost` từ
// `req.body` — client tự khai giá phải trả cho chính mình. Gửi `energyCost: 0`
// là chơi miễn phí; gửi SỐ ÂM thì `$inc: { energy: -(-100) }` đổi dấu và client
// TỰ CỘNG năng lượng cho mình, biến endpoint "tiêu" thành vòi bơm.
// Xem SEC-be.userstate-002 (phần luyện tập).
//
// Bảng này là bản sao của `frontend/src/game/config.js` — hai nguồn sự thật cho
// một con số, đúng hình dạng SYS-001. Server là nguồn có thẩm quyền; bảng phía
// client chỉ để hiển thị trước và chặn sớm cho đỡ tốn request. Cách đóng hẳn là
// server trả bảng này xuống trong `GET /user/state` để client đọc thay vì tự
// khai — đã ghi ở Long-term của report.

/** Chế độ luyện tập → số ⚡ mỗi lượt. Khớp frontend/src/game/config.js. */
const PRACTICE_COSTS = {
    'multiple-choice': 10,
    'fill-blank': 15,
    'listening': 12,
    'matching': 10,
    'speed-quiz': 20,
    'flashcard': 8,
    'synonym-check': 10,
    'word-type-check': 10,
    'example-fill-blank': 12,
    'review-mistakes': 10,
    'sentence-builder': 15,
    'pronunciation': 15,
    'context-learning': 10,
    'dictation': 15,
    'sentence-listening': 12,
    'phonetic-quiz': 12,
    'hanzi-writing': 15,
};

/**
 * Giá của một chế độ, hoặc `null` nếu không biết chế độ đó.
 *
 * Trả `null` chứ KHÔNG trả một giá mặc định: chế độ lạ phải là lỗi rõ ràng.
 * Mặc định `= 10` như bản cũ nghĩa là gõ sai tên chế độ vẫn chơi được với giá
 * tuỳ tiện — và đó cũng là cách một chế độ đắt tiền bị mua với giá rẻ.
 */
function practiceEnergyCost(mode) {
    const cost = PRACTICE_COSTS[String(mode || '').trim()];
    return Number.isFinite(cost) ? cost : null;
}

/**
 * VIP còn hạn thì không trừ năng lượng — đúng mô tả "Unlimited energy" của gói.
 *
 * Luật này trước đây CHỈ tồn tại ở client (`GameState.useEnergy`), nên server
 * không biết gì về nó. Đưa lên đây để nơi trừ tiền và nơi quyết định miễn trừ
 * là một chỗ; để ở client thì bỏ trừ phía client là mất luôn miễn trừ.
 */
function isVipActive(stats, at = Date.now()) {
    const until = stats?.vipExpiresAt;
    return !!(until && new Date(until).getTime() > at);
}

module.exports = { PRACTICE_COSTS, practiceEnergyCost, isVipActive };
