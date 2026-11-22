/**
 * Dịch nhanh một đoạn ngắn sang tiếng Việt — cho nút "Dịch" trong bong bóng Hội thoại.
 *
 * Dùng chung đường dịch với popup Dịch nhanh (lib/dichMay.js): Google trước, Google tạm chặn thì
 * MyMemory. Không tốn token AI, không qua server. Tự nhận ngôn ngữ nguồn nên dùng được cho cả
 * tiếng Anh lẫn tiếng Trung.
 */
import { dichMay } from './dichMay.js';

/** Cắt bớt để không gửi nhầm cả đoạn dài lên URL. */
const MAX_DICH = 500;

export async function dichSangViet(text) {
    const q = String(text || '').trim().slice(0, MAX_DICH);
    if (!q) return '';
    return (await dichMay(q, { sl: 'auto', tl: 'vi' })).translated;
}
