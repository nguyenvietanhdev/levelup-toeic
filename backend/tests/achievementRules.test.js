/**
 * Thành tích phải KIỂM ĐIỀU KIỆN trước khi phát thưởng (SEC-be.userstate-001).
 *
 * Vì sao cần: `unlockAchievement` từng chỉ kiểm "đã mở chưa" và "mã có thật
 * không" rồi cộng xu/gems/XP. `conditionType`/`conditionValue` — "đạt level 50",
 * "streak 7 ngày" — chỉ được chép vào state để hiển thị, không ai so nó với gì.
 * Tài khoản mới đăng ký gọi lần lượt các mã trong catalog là nhận trọn bộ, chưa
 * chơi ván nào. XP còn kéo level lên nên vượt luôn cổng requireLevel.
 *
 * Bảng loại điều kiện dựng từ DB THẬT chứ không từ file seed: trong repo có ba
 * bộ tên khác nhau, và bộ nằm trong DB có `games_played`/`total_xp`/`accuracy`/
 * `words_mastered` mà cả hai file seed đều không có. Viết theo seed là từ chối
 * chính những thành tích hợp lệ — nên file này chốt cả 9 loại đang dùng thật.
 */
const { checkAchievementCondition, CONDITION_READERS, normalizeType } = require('../utils/achievementRules');

const stats = (over = {}) => ({
    wordsLearned: [], wordsMastered: [],
    totalGamesPlayed: 0, totalCorrectAnswers: 0, totalWrongAnswers: 0,
    perfectRounds: 0, streakCurrent: 0, totalXp: 0, totalSessions: 0,
    ...over,
});

describe('9 loại điều kiện đang có trong DB thật đều đọc được', () => {
    test.each([
        ['words_learned',   { wordsLearned: ['a', 'b', 'c'] }, 3],
        ['words_mastered',  { wordsMastered: ['a'] }, 1],
        ['games_played',    { totalGamesPlayed: 12 }, 12],
        ['correct_answers', { totalCorrectAnswers: 40 }, 40],
        ['perfect_rounds',  { perfectRounds: 5 }, 5],
        ['streak',          { streakCurrent: 7 }, 7],
        ['total_xp',        { totalXp: 900 }, 900],
    ])('%s đọc đúng giá trị', (type, over, expected) => {
        expect(CONDITION_READERS[type](stats(over))).toBe(expected);
    });

    test('level đọc từ profile, không phải stats', () => {
        expect(CONDITION_READERS.level(stats(), { level: 50 })).toBe(50);
        expect(CONDITION_READERS.level(stats(), undefined)).toBe(1);
    });

    test('accuracy tính theo phần trăm đúng/tổng', () => {
        expect(CONDITION_READERS.accuracy(stats({ totalCorrectAnswers: 9, totalWrongAnswers: 1 }))).toBe(90);
        // Chưa trả lời câu nào → 0, KHÔNG phải chia cho 0 rồi ra NaN.
        expect(CONDITION_READERS.accuracy(stats())).toBe(0);
    });
});

describe('checkAchievementCondition — cửa chặn', () => {
    const def = (over = {}) => ({ conditionType: 'streak', conditionValue: 7, ...over });

    test('chưa đạt → từ chối, kèm tiến độ hiện tại để hiện cho người dùng', () => {
        const r = checkAchievementCondition(def(), stats({ streakCurrent: 3 }));
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('not_reached');
        expect(r.current).toBe(3);
    });

    test('đúng bằng mốc → ĐẠT (>= chứ không phải >)', () => {
        expect(checkAchievementCondition(def(), stats({ streakCurrent: 7 })).ok).toBe(true);
    });

    test('vượt mốc → đạt', () => {
        expect(checkAchievementCondition(def(), stats({ streakCurrent: 100 })).ok).toBe(true);
    });

    test('KHÔNG đạt thì không có đường nào lọt — đây là cửa duy nhất', () => {
        // Ca chốt chính bug cũ: mọi thành tích đều claim được khi chưa đạt.
        for (const type of Object.keys(CONDITION_READERS)) {
            const r = checkAchievementCondition({ conditionType: type, conditionValue: 999999 }, stats(), { level: 1 });
            expect(r.ok).toBe(false);
        }
    });
});

describe('loại điều kiện lạ phải TỪ CHỐI, không được cho qua', () => {
    test.each([
        ['không có trong bảng', 'leaderboard'],
        ['rỗng', ''],
        ['undefined', undefined],
        ['tên bịa', 'anything_goes'],
    ])('%s → từ chối', (_label, conditionType) => {
        const r = checkAchievementCondition({ conditionType, conditionValue: 1 }, stats());
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/unsupported_condition/);
    });

    test('conditionValue không phải số → từ chối', () => {
        const r = checkAchievementCondition({ conditionType: 'streak', conditionValue: 'nhiều' }, stats());
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('invalid_condition_value');
    });

    test('def rỗng/undefined không làm ném lỗi', () => {
        expect(checkAchievementCondition(undefined, stats()).ok).toBe(false);
        expect(checkAchievementCondition({}, stats()).ok).toBe(false);
    });
});

describe('hai quy ước đặt tên trong repo đều khớp', () => {
    test('gạch ngang và gạch dưới cho cùng kết quả', () => {
        // startupTasks.js dùng 'words-learned', DB dùng 'words_learned'.
        const s = stats({ wordsLearned: ['a', 'b'] });
        const kebab = checkAchievementCondition({ conditionType: 'words-learned', conditionValue: 2 }, s);
        const snake = checkAchievementCondition({ conditionType: 'words_learned', conditionValue: 2 }, s);
        expect(kebab).toEqual(snake);
        expect(kebab.ok).toBe(true);
    });

    test('bí danh của bộ seed cũ vẫn tra được', () => {
        const s = stats({ totalSessions: 5 });
        expect(checkAchievementCondition({ conditionType: 'total-sessions', conditionValue: 5 }, s).ok).toBe(true);
        expect(checkAchievementCondition({ conditionType: 'sessions', conditionValue: 5 }, s).ok).toBe(true);
    });

    test('normalizeType chịu được hoa thường và khoảng trắng', () => {
        expect(normalizeType('  Words-Learned ')).toBe('words_learned');
    });
});
