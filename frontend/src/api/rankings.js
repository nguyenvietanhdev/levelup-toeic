// ===================================
// LEADERBOARD (RANKINGS) API SERVICE
// ===================================
// ESM raw-fetch wrapper, shape preserved (pure move from LeaderboardScreen).
// Replaced the legacy non-ESM api/leaderboard.js (deleted — was unused).

export const RankingsAPI = {
    /** @returns parsed JSON, {success:false} on error. */
    async byPeriod(period, { sortBy = 'totalXp', order = 'desc' } = {}) {
        const qs = new URLSearchParams({ sortBy, order }).toString();
        return fetch(`/api/leaderboard/${period}?${qs}`)
            .then(r => r.json())
            .catch(() => ({ success: false }));
    },
};
