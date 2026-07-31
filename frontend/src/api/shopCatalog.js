// ===================================
// SHOP CATALOG API SERVICE
// ===================================
// Item list (raw fetch, shape preserved). Purchase still goes through
// API.shop.purchase in http.js. Pure move from ShopScreen.

import { authHeaders } from '@/auth/token.js';

export const ShopCatalogAPI = {
    /** @returns parsed JSON, {success:false} on error. */
    async items() {
        // Gửi kèm token để server trả về trạng thái cooldown theo user (vật
        // phẩm giới hạn chu kỳ) → client mới vô hiệu hoá được nút.
        return fetch('/api/shop/items', { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false }));
    },
};
