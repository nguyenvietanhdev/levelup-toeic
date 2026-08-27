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

    /**
     * Nhận NHIỀU thành tích trong MỘT request.
     *
     * Gọi `claim()` lần lượt cho 30 cái mất 8,2 giây (đo thật: 273ms/request),
     * và suốt thời gian đó giao diện đứng hình với số đếm nhảy lùi dần.
     *
     * @param ids Danh sách mã cần nhận. Bỏ trống = mọi thành tích đã đạt.
     */
    async claimAll(ids) {
        return fetch('/api/user/achievements/claim-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(ids ? { ids } : {}),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },
};
