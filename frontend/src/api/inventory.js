// ===================================
// INVENTORY API SERVICE
// ===================================
// Bọc các endpoint /api/inventory (túi đồ + trang bị cosmetic).
import { authHeaders } from '@/auth/token.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

let _itemsPromise = null; // cache catalog cho cả phiên

export const InventoryAPI = {
    /** Túi đồ của tôi + slot đang trang bị. → { success, data, equipped } */
    async get() {
        return fetch('/api/inventory', { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false, data: [], equipped: {} }));
    },

    /** Catalog item (public). Memoize promise — catalog tĩnh trong 1 phiên,
     *  nhiều nơi (túi đồ, nhiệm vụ) gọi chung 1 lần fetch. */
    items() {
        if (!_itemsPromise) {
            _itemsPromise = fetch('/api/inventory/items')
                .then(r => r.json())
                .catch(() => ({ success: false, data: [] }));
        }
        return _itemsPromise;
    },

    /** Dùng / kích hoạt đồ (vd thẻ boost on_use). */
    async use(itemId) {
        return fetch('/api/inventory/use', {
            method: 'POST',
            headers: { ...JSON_HEADERS, ...authHeaders() },
            body: JSON.stringify({ itemId }),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },

    /** Trang bị cosmetic. */
    async equip(itemId) {
        return fetch('/api/inventory/equip', {
            method: 'POST',
            headers: { ...JSON_HEADERS, ...authHeaders() },
            body: JSON.stringify({ itemId }),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },

    /** Bỏ trang bị theo slot. */
    async unequip(slot) {
        return fetch('/api/inventory/unequip', {
            method: 'POST',
            headers: { ...JSON_HEADERS, ...authHeaders() },
            body: JSON.stringify({ slot }),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },
};
