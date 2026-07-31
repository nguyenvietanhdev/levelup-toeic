// ===================================
// QUESTS API SERVICE
// ===================================
// Raw-fetch wrappers preserving the shape used by HomeScreen / QuestScreen /
// quest.js (returns the backend body unchanged). Pure move.

import { authHeaders } from '@/auth/token.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const QuestsAPI = {
    /** @returns raw response (caller does r.json()) — matches quest.js usage. */
    listRaw(type = 'daily') {
        return fetch(`/api/quests?type=${type}`, { headers: authHeaders() });
    },

    /** @returns parsed JSON, {success:false} on error — matches QuestScreen usage. */
    async list(type = 'daily') {
        return fetch(`/api/quests?type=${type}`, { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false }));
    },

    /** @returns raw response (caller does r.json()) — matches quest.js usage. */
    syncRaw(body) {
        return fetch('/api/quests/sync', {
            method: 'POST',
            headers: { ...JSON_HEADERS, ...authHeaders() },
            body: JSON.stringify(body),
        });
    },

    /** @returns raw response (caller does r.json()) — matches quest.js usage. */
    claimRaw(body) {
        return fetch('/api/quests/claim', {
            method: 'POST',
            headers: { ...JSON_HEADERS, ...authHeaders() },
            body: JSON.stringify(body),
        });
    },

    /** @returns parsed JSON — matches HomeScreen / QuestScreen usage. */
    async claim(body) {
        return fetch('/api/quests/claim', {
            method: 'POST',
            headers: { ...JSON_HEADERS, ...authHeaders() },
            body: JSON.stringify(body),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },
};
