// ===================================
// REPORTS API SERVICE
// ===================================
// Encapsulates the bug-report submit flow, including the auth→guest
// fallback (retry as guest on 401/403). Behaviour identical to the
// previous inline logic in SettingsScreen.jsx.

import { getToken, authHeaders } from '@/auth/token.js';

export const ReportsAPI = {
    /**
     * @param {FormData} formData fields: content, optional image.
     * @returns {Promise<object>} parsed JSON ({ success, message }).
     */
    async submit(formData) {
        const endpoint = getToken() ? '/api/reports' : '/api/reports/guest';
        let res = await fetch(endpoint, {
            method: 'POST',
            headers: authHeaders(),
            body: formData,
        });
        if (res.status === 401 || res.status === 403) {
            res = await fetch('/api/reports/guest', { method: 'POST', body: formData });
        }
        return res.json();
    },
};
