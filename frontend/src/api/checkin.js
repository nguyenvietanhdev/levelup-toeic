import { authHeaders } from '@/auth/token.js';

export const CheckinAPI = {
    async get() {
        return fetch('/api/checkin', { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false }));
    },
    async claim() {
        return fetch('/api/checkin/claim', {
            method: 'POST',
            headers: authHeaders(),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },
};
