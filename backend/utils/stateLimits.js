// ===================================
// STATE LIMITS
// ===================================
// Chặn trần cho các mảng mà client được phép ghi qua `saveState`.
//
// Vì sao cần: `saveState` gán thẳng `wordsLearned`, `wordsMastered`,
// `practiceHistory` từ body — hai cái đầu còn không kiểm cả kiểu mảng. Hai hậu
// quả, cái thứ hai mới là lý do nó không phải finding vặt:
//
//  1. Document `UserStats` bị giới hạn 16MB. Không trần thì một tài khoản tự
//     đẩy document của mình tới sát ngưỡng bằng vài request, sau đó MỌI ghi vào
//     tài khoản đó đều lỗi — kể cả các đường tiền server-authoritative.
//
//  2. `wordsLearned` là ĐẦU VÀO của điều kiện thành tích `words_learned`
//     (utils/achievementRules.js). Sau khi bản vá SEC-be.userstate-001 bắt kiểm
//     điều kiện, mảng này trở thành thứ quyết định có được trả thưởng hay không
//     — mà client vẫn ghi được tuỳ ý. Không chặn ở đây thì bản vá kia có một
//     đường vòng: tự nhét 200 từ vào `wordsLearned` rồi đi nhận thành tích.
//
// Xem SEC-be.userstate-003.

/** Kho từ vựng lớn nhất hiện có ~7.800 từ; để rộng gấp đôi cho các bộ tương lai. */
const MAX_WORDS = 20000;

/** Lịch sử luyện tập chỉ dùng để hiển thị vài mục gần nhất. */
const MAX_PRACTICE_HISTORY = 200;

/**
 * Danh sách từ đã học/thành thạo: phải là mảng CHUỖI, bỏ trùng, cắt theo trần.
 *
 * Trả `null` khi đầu vào không phải mảng — để call site phân biệt "client không
 * gửi trường này" với "client gửi rác", và **bỏ qua** thay vì ghi rác vào DB.
 * Bản cũ chỉ kiểm truthy nên một object cũng gán được vào chỗ đáng lẽ là mảng.
 */
function boundWordList(raw) {
    if (!Array.isArray(raw)) return null;
    const seen = new Set();
    for (const w of raw) {
        if (typeof w !== 'string') continue;
        const t = w.trim();
        if (t) seen.add(t);
        if (seen.size >= MAX_WORDS) break;
    }
    return [...seen];
}

/**
 * Lịch sử luyện tập: giữ `MAX_PRACTICE_HISTORY` mục ĐẦU (client gửi mới nhất trước).
 * Trả `null` nếu không phải mảng.
 */
function boundPracticeHistory(raw) {
    if (!Array.isArray(raw)) return null;
    return raw.slice(0, MAX_PRACTICE_HISTORY);
}

module.exports = { boundWordList, boundPracticeHistory, MAX_WORDS, MAX_PRACTICE_HISTORY };
