// ===================================
// VOCABULARY UPLOAD API SERVICE
// ===================================
// Wraps the /api/upload/* endpoints (personal vocabulary management).
// Used by useTopics (my-topics) and the upload modal in TopNav.
// Each method returns the parsed JSON exactly as callers already expect
// ({ success, data, message }) — pure move, no behaviour change.

import { authHeaders } from '@/auth/token.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const UploadVocabAPI = {
    /** Create one vocabulary item. @returns parsed JSON. */
    async create(payload) {
        return fetch('/api/upload/vocabulary', {
            method: 'POST',
            headers: { ...JSON_HEADERS, ...authHeaders() },
            body: JSON.stringify(payload),
        }).then(r => r.json());
    },

    /** List the current user's vocabulary sources. @returns parsed JSON. */
    async myTopics() {
        return fetch('/api/upload/my-topics', { headers: authHeaders() })
            .then(r => r.json());
    },

    /** Private sources expiring soon (≤ warnDays). @returns parsed JSON. */
    async expiring() {
        return fetch('/api/upload/expiring', { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false, data: [] }));
    },

    /** List words for one source. @returns parsed JSON. */
    async myVocabulary(source) {
        return fetch(`/api/upload/my-vocabulary/${encodeURIComponent(source)}`, {
            headers: authHeaders(),
        }).then(r => r.json());
    },

    /** Delete one word by id. @returns parsed JSON. */
    async deleteWord(wordId) {
        return fetch(`/api/upload/my-vocabulary/${wordId}`, {
            method: 'DELETE',
            headers: authHeaders(),
        }).then(r => r.json());
    },

    /** Update one word's content by id. @returns parsed JSON. */
    async updateWord(wordId, payload) {
        return fetch(`/api/upload/my-vocabulary/${wordId}`, {
            method: 'PUT',
            headers: { ...JSON_HEADERS, ...authHeaders() },
            body: JSON.stringify(payload),
        }).then(r => r.json());
    },

    // ── Chia sẻ bộ từ cho tài khoản khác ────────────────────────────────────

    /** Cấp quyền xem một bộ cho `granteeEmail`. Gọi lại là không-thao-tác. */
    async shareSource(source, granteeEmail) {
        return fetch(`/api/upload/share/${encodeURIComponent(source)}`, {
            method: 'POST',
            headers: { ...JSON_HEADERS, ...authHeaders() },
            body: JSON.stringify({ granteeEmail }),
        }).then(r => r.json());
    },

    /** Thu hồi quyền của một người. */
    async unshareSource(source, granteeEmail) {
        return fetch(
            `/api/upload/share/${encodeURIComponent(source)}/${encodeURIComponent(granteeEmail)}`,
            { method: 'DELETE', headers: authHeaders() },
        ).then(r => r.json());
    },

    /** Ai đang được xem bộ này. */
    async listSharees(source) {
        return fetch(`/api/upload/share/${encodeURIComponent(source)}`, { headers: authHeaders() })
            .then(r => r.json());
    },

    /** Những bộ NGƯỜI KHÁC đã chia sẻ cho tôi (kèm cờ `expired` cho bộ đã hết hạn). */
    async sharedTopics() {
        return fetch('/api/upload/shared-topics', { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false, data: [] }));
    },

    /** Từ của một bộ được chia sẻ. */
    async sharedVocabulary(ownerEmail, source) {
        return fetch(
            `/api/upload/shared-vocabulary/${encodeURIComponent(ownerEmail)}/${encodeURIComponent(source)}`,
            { headers: authHeaders() },
        ).then(r => r.json());
    },

    /** Sao chép một bộ được chia sẻ về kho của mình. */
    async copySharedSource(ownerEmail, source) {
        return fetch(
            `/api/upload/shared-vocabulary/${encodeURIComponent(ownerEmail)}/${encodeURIComponent(source)}/copy`,
            { method: 'POST', headers: authHeaders() },
        ).then(r => r.json());
    },

    /** Extend (renew) a source's expiry by the default retention. */
    async extendSource(source) {
        return fetch(`/api/upload/extend/${encodeURIComponent(source)}`, {
            method: 'POST',
            headers: { ...JSON_HEADERS, ...authHeaders() },
        }).then(r => r.json());
    },

    /** Delete an entire source. @returns parsed JSON. */
    async deleteSource(source) {
        return fetch(`/api/upload/my-source/${encodeURIComponent(source)}`, {
            method: 'DELETE',
            headers: authHeaders(),
        }).then(r => r.json());
    },
};
