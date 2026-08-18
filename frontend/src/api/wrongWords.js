// ===================================
// WRONG WORDS API SERVICE
// ===================================
// Wraps the /api/wrong-words/* endpoints (từ vựng đã làm sai).
// Backend phân biệt người dùng bằng userEmail; ở đây chỉ cần token.
// Mỗi method trả về JSON đã parse đúng shape ({ success, count, data }).

import { authHeaders } from '@/auth/token.js';

/** Ném Error mang theo NGUYÊN payload (mã lỗi, số liệu), không chỉ câu chữ. */
function fail(payload = {}, fallback = 'Yêu cầu thất bại') {
    const err = new Error(payload.message || payload.error || fallback);
    Object.assign(err, payload);
    return err;
}

/** POST kèm token, trả JSON đã parse; ném khi server báo thất bại. */
async function post(path, body) {
    const res = await fetch(`/api/wrong-words${path}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw fail(json, `Lỗi ${res.status}`);
    return json;
}

export const WrongWordsAPI = {
    /** Toàn bộ từ sai đang active của user hiện tại. @returns parsed JSON. */
    async list(limit = 1000) {
        return fetch(`/api/wrong-words?limit=${limit}`, { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false, data: [] }));
    },

    /**
     * Từ ĐẾN HẠN ôn theo lịch SM-2.
     *
     * Trả về cả `dueTotal` (tổng đến hạn, KHÔNG phụ thuộc `limit`) — màn hình
     * cần con số này để biết còn bao nhiêu sau phiên, và menu cần nó cho badge.
     *
     * @param {boolean} all - bỏ lọc theo hạn, để ôn thêm khi đã hết từ đến hạn.
     */
    async due({ limit = 10, all = false } = {}) {
        const res = await fetch(
            `/api/wrong-words/review?limit=${limit}${all ? '&all=1' : ''}`,
            { headers: authHeaders() }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw fail(json, `Lỗi ${res.status}`);
        return {
            words: Array.isArray(json.data) ? json.data : [],
            dueTotal: Number(json.dueTotal) || 0,
        };
    },

    /** Trả lời ĐÚNG → SM-2 giãn lịch ra, mastery +1. */
    async correct(wordId) {
        return post(`/${encodeURIComponent(wordId)}/correct`, {});
    },

    /**
     * Trả lời SAI → SM-2 kéo lịch về 1 ngày, mastery −1.
     *
     * Dùng `POST /wrong-words` chứ không phải một route riêng: với từ ĐÃ TỒN TẠI
     * nó gọi đúng `recordWrong()`. Phải gửi kèm `en`/`vn` vì route này vốn để
     * THÊM từ sai mới nên bắt buộc ba trường đó.
     */
    async wrong(word) {
        return post('', {
            wordId: word.wordId,
            en: word.en,
            vn: word.vn,
            phonetic: word.phonetic || '',
            type: word.type || '',
            level: word.level || '',
            part: word.part || '',
            example: word.example || '',
            image: word.image || '',
            source: word.source || '',
        });
    },
};
