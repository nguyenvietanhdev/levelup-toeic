// ===================================
// NOTIFICATIONS API SERVICE
// ===================================
// Thin wrappers over the notification endpoints. Behaviour identical to the
// previous inline fetch calls in useNotifications.js (same error-swallowing).

import { authHeaders } from '@/auth/token.js';

export const NotificationsAPI = {
    /** @returns {Promise<{success:boolean,data?:{count:number}}>} never throws. */
    async unreadCount() {
        return fetch('/api/notifications/unread-count', { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false }));
    },

    /**
     * @param {string} [tab] when omitted or 'all', fetches the unfiltered list.
     * @returns {Promise<{success:boolean,data?:any[]}>} never throws.
     */
    async list(tab) {
        const url = tab && tab !== 'all'
            ? `/api/notifications?tab=${tab}`
            : '/api/notifications';
        return fetch(url, { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false }));
    },

    /** Fire-and-forget mark-all-read; errors swallowed. */
    async markAllRead() {
        await fetch('/api/notifications/read-all', {
            method: 'PUT',
            headers: authHeaders(),
        }).catch(() => {});
    },

    /** Xoá TẤT CẢ thông báo của user hiện tại. @returns parsed JSON. */
    async deleteAll() {
        return fetch('/api/notifications', {
            method: 'DELETE',
            headers: authHeaders(),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },

    /** Nhận quà đính kèm thông báo cá nhân. */
    async claimGift(id) {
        return fetch(`/api/notifications/${encodeURIComponent(id)}/claim-gift`, {
            method: 'POST',
            headers: authHeaders(),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },

    /** Xoá 1 notif CÁ NHÂN. Không gọi cho broadcast (server từ chối). */
    async deleteOne(id) {
        return fetch('/api/notifications/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: authHeaders(),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },
};
