// Mùa giải.
import { authHeaders } from '@/auth/token.js';

export const SeasonAPI = {
    /** Mùa đang chạy — public, không cần token. */
    async current() {
        return fetch('/api/season/current')
            .then(r => r.json())
            .catch(() => ({ success: false }));
    },

    /** Hành trình các mùa đã kết thúc của chính mình — cần token. */
    async myHistory() {
        return fetch('/api/season/my-history', { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false }));
    },
};
