// Logic thuần (không React) tách khỏi AchievementsScreen.jsx để những nơi chỉ
// cần tính tiến độ (vd. badge đếm số thành tích khả nhận) không kéo theo cả
// component UI vào bundle của chúng — giữ code-splitting cho AchievementsScreen hiệu quả.

// Alias cũ → khoá chuẩn (sau khi đã thay _ thành -)
const METRIC_ALIASES = {
    'total-sessions': 'sessions',
    'total-answers': 'correct-answers',
    'total-questions': 'questions-answered',
    'words-mastered': 'words-mastered',
    'longest-streak': 'streak-longest',
    'xp': 'total-xp',
    'xp-total': 'total-xp',
    'score': 'highest-score',
    'playtime': 'play-time',
    'time': 'play-time',
};

export function calculateProgress(ach) {
    const state = window.GameState?.state || {};
    const p = state.progress || {};
    const raw = (ach.conditionType || '').toLowerCase().replace(/_/g, '-');
    const type = METRIC_ALIASES[raw] || raw;
    const target = ach.conditionValue || 1;

    const correct = p.totalCorrectAnswers || 0;
    const wrong = p.totalWrongAnswers || 0;

    let current = 0;
    switch (type) {
        case 'words-learned':    current = (p.wordsLearned || []).length; break;
        case 'words-mastered':   current = (p.wordsMastered || []).length; break;
        case 'sessions':         current = p.totalSessions || p.totalGamesPlayed || 0; break;
        case 'games-played':     current = p.totalGamesPlayed || 0; break;
        case 'perfect-rounds':   current = p.perfectRounds || 0; break;
        case 'correct-answers':  current = correct; break;
        case 'wrong-answers':    current = wrong; break;
        case 'questions-answered': current = p.totalQuestionsAnswered || (correct + wrong); break;
        case 'streak':           current = state.streak?.current || 0; break;
        case 'streak-longest':   current = state.streak?.longest || 0; break;
        case 'level':            current = state.user?.level || 1; break;
        case 'total-xp':         current = state.user?.totalXp || 0; break;
        case 'coins':            current = state.resources?.coins || 0; break;
        case 'gems':             current = state.resources?.gems || 0; break;
        case 'highest-score':    current = p.highestScore || 0; break;
        case 'play-time':        current = p.totalPlayTime || 0; break;
        case 'accuracy':
            current = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
            break;
        case 'mode-plays': {
            const mode = (ach.conditionMode || '').trim();
            current = mode ? (p.modeStats?.[mode]?.played || 0) : 0;
            break;
        }
        default:                 current = 0;
    }
    current = Math.min(current, target);
    return { current, pct: Math.round((current / target) * 100) };
}
