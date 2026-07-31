import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { GameLogic } from '@game/gameLogic.js';

export const SessionService = {

    calculateResults(session) {
        const duration = (session.endTime - session.startTime) / 1000;
        const mode = session.mode;
        const config = Config.practice[mode] || {};
        const totalQuestions = session.correctAnswers + session.wrongAnswers;
        const isPerfect = session.wrongAnswers === 0;

        const scoreData = GameLogic.calculateScore(
            session.correctAnswers,
            totalQuestions,
            duration,
            config.timeLimit || 300,
            mode
        );

        const xpReward = GameLogic.calculateXpReward(
            session.correctAnswers,
            totalQuestions,
            isPerfect
        );

        const coinsReward = GameLogic.calculateCoinsReward(
            session.correctAnswers,
            totalQuestions,
            isPerfect
        );

        const gemsBonus = this.calculateGemsBonus(totalQuestions, GameState.state.settings.randomQuestions !== false);

        return { scoreData, xpReward, coinsReward, gemsBonus, isPerfect, totalQuestions, duration };
    },

    calculateGemsBonus() { return 0; },

    applyResultsToState(session, results) {
        const { scoreData, xpReward, coinsReward, gemsBonus, isPerfect } = results;
        const mode = session.mode;

        GameState.addXp(xpReward, true);
        GameState.addCoins(coinsReward, true);
        if (gemsBonus > 0) GameState.addGems(gemsBonus, true);

        GameState.state.progress.totalGamesPlayed++;
        GameState.state.progress.totalCorrectAnswers += session.correctAnswers;
        GameState.state.progress.totalWrongAnswers += session.wrongAnswers;

        if (isPerfect) {
            GameState.state.progress.perfectRounds++;
        }

        if (scoreData.totalScore > GameState.state.progress.highestScore) {
            GameState.state.progress.highestScore = scoreData.totalScore;
        }

        if (!GameState.state.progress.modeStats[mode]) {
            GameState.state.progress.modeStats[mode] = { played: 0, score: 0, correct: 0, total: 0 };
        }

        const stats = GameState.state.progress.modeStats[mode];
        stats.played++;
        stats.score = Math.max(stats.score, scoreData.totalScore);
        stats.correct += session.correctAnswers;
        stats.total += session.correctAnswers + session.wrongAnswers;
    },

    recordHistory(session, xpReward, coinsReward, duration) {
        const today = new Date().toISOString().split('T')[0];

        // Ghi ngày học vào studiedDays (nguồn bền cho lịch streak, không bị
        // xoá khi reset thống kê hàng tháng).
        const prog = GameState.state.progress;
        if (prog) {
            if (!Array.isArray(prog.studiedDays)) prog.studiedDays = [];
            if (!prog.studiedDays.includes(today)) prog.studiedDays.push(today);
        }

        let entry = GameState.state.practiceHistory?.find(e => e.date === today);

        if (!entry) {
            if (!GameState.state.practiceHistory) GameState.state.practiceHistory = [];
            entry = {
                date: today,
                sessionsCompleted: 0,
                questionsAnswered: 0,
                correctAnswers: 0,
                totalXpEarned: 0,
                totalCoinsEarned: 0,
                timeSpent: 0,
            };
            GameState.state.practiceHistory.push(entry);
        }

        entry.sessionsCompleted++;
        entry.questionsAnswered += session.correctAnswers + session.wrongAnswers;
        entry.correctAnswers += session.correctAnswers;
        entry.totalXpEarned += xpReward;
        entry.totalCoinsEarned += coinsReward;
        entry.timeSpent += Math.round(duration);

        if (!entry.hourlyStats) entry.hourlyStats = [];
        const hour = new Date().getHours();
        let h = entry.hourlyStats.find(x => x.hour === hour);
        if (!h) { h = { hour, sessions: 0, xp: 0, correct: 0, answered: 0, time: 0 }; entry.hourlyStats.push(h); }
        h.sessions++;
        h.xp += xpReward;
        h.correct += session.correctAnswers;
        h.answered += session.correctAnswers + session.wrongAnswers;
        h.time += Math.round(duration);
    },
};

