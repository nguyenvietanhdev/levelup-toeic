// ===================================
// ACHIEVEMENTS API SERVICE
// ===================================
// Raw-fetch wrapper, shape preserved (pure move from AchievementsScreen).

import { authHeaders } from '@/auth/token.js';

export const AchievementsAPI = {
    /** Claim an achievement reward. @returns parsed JSON, {success:false} on error. */
    async claim(achievementId) {
        return fetch('/api/user/achievement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ achievementId }),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },
};
