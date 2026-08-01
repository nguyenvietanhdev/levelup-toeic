// ===================================
// ACHIEVEMENT RULES
// ===================================
// Đọc điều kiện của một thành tích và so với trạng thái thật của người chơi.
//
// Vì sao có file này: `unlockAchievement` từng phát thưởng mà KHÔNG BAO GIỜ đọc
// `conditionType`/`conditionValue`. Hai trường đó chỉ được chép vào state để
// hiển thị cho người dùng đọc — server thì cộng xu/gems/XP cho bất kỳ ai gọi
// đúng mã. Tài khoản mới đăng ký gọi lần lượt các mã trong catalog là nhận trọn
// bộ, chưa chơi ván nào; XP còn kéo level lên nên vượt luôn cổng `requireLevel`.
// Xem SEC-be.userstate-001.
//
// Tách thuần để test được — cùng khuôn `itemDefRules.js`, `loginBackoff.js`.

/**
 * Bảng ALLOW-LIST: conditionType → cách đọc giá trị hiện tại của người chơi.
 *
 * Danh sách này dựng từ dữ liệu THẬT (`distinct("conditionType")` trên DB), không
 * phải từ file seed — vì trong repo có tới ba bộ tên khác nhau: `startupTasks.js`
 * dùng gạch ngang (`words-learned`), `adminDefinitions.js` dùng gạch dưới nhưng
 * thiếu vài loại, còn DB thật lại có `games_played`/`total_xp`/`accuracy`/
 * `words_mastered` mà cả hai file seed đều không có. Viết bảng theo file seed là
 * từ chối chính những thành tích hợp lệ.
 *
 * Khoá đã chuẩn hoá: mọi `-` đổi thành `_` trước khi tra, nên cả hai quy ước đặt
 * tên đều khớp.
 */
const CONDITION_READERS = {
    words_learned:   (s) => (s.wordsLearned || []).length,
    words_mastered:  (s) => (s.wordsMastered || []).length,
    games_played:    (s) => s.totalGamesPlayed || 0,
    correct_answers: (s) => s.totalCorrectAnswers || 0,
    perfect_rounds:  (s) => s.perfectRounds || 0,
    streak:          (s) => s.streakCurrent || 0,
    total_xp:        (s) => s.totalXp || 0,
    level:           (s, p) => p?.level || 1,
    accuracy:        (s) => {
        const ok = s.totalCorrectAnswers || 0;
        const total = ok + (s.totalWrongAnswers || 0);
        return total ? Math.round((ok / total) * 100) : 0;
    },

    // Bí danh của các bộ seed cũ, để DB nào cũng chạy được.
    total_sessions:  (s) => s.totalSessions || 0,
    sessions:        (s) => s.totalSessions || 0,
    total_answers:   (s) => s.totalCorrectAnswers || 0,
};

const normalizeType = (t) => String(t || '').trim().toLowerCase().replace(/-/g, '_');

/**
 * Người chơi đã đạt điều kiện của thành tích chưa?
 *
 * @returns {{ok: true, current: number} | {ok: false, reason: string, current?: number}}
 *
 * Loại điều kiện LẠ → `ok: false` chứ không phải cho qua. Đây là hướng an toàn:
 * một `conditionType` không tra được phải là lỗi cấu hình rõ ràng, không được âm
 * thầm trở thành "điều kiện luôn đúng" — đó chính là hình dạng của bug cũ.
 */
function checkAchievementCondition(def, stats, profile) {
    const type = normalizeType(def?.conditionType);
    const read = CONDITION_READERS[type];

    if (!read) {
        return { ok: false, reason: `unsupported_condition:${def?.conditionType ?? ''}` };
    }

    const need = Number(def?.conditionValue);
    if (!Number.isFinite(need)) {
        return { ok: false, reason: 'invalid_condition_value' };
    }

    const current = read(stats || {}, profile);
    return current >= need
        ? { ok: true, current }
        : { ok: false, reason: 'not_reached', current };
}

module.exports = { checkAchievementCondition, CONDITION_READERS, normalizeType };
