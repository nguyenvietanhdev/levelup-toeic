// ===================================
// WRONG WORDS API SERVICE
// ===================================
// Wraps the /api/wrong-words/* endpoints (từ vựng đã làm sai).
// Backend phân biệt người dùng bằng userEmail; ở đây chỉ cần token.
// Mỗi method trả về JSON đã parse đúng shape ({ success, count, data }).

import { authHeaders } from '@/auth/token.js';

export const WrongWordsAPI = {
    /** Toàn bộ từ sai đang active của user hiện tại. @returns parsed JSON. */
    async list(limit = 1000) {
        return fetch(`/api/wrong-words?limit=${limit}`, { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false, data: [] }));
    },
};
