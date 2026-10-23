/**
 * Dịch nhanh một đoạn ngắn sang tiếng Việt — cho nút "Dịch" trong bong bóng Hội thoại.
 *
 * Dùng CÙNG endpoint Google mà popup Dịch nhanh (TranslateModal) đang dùng: không
 * tốn token AI, không qua server, và đã nằm trong CSP. Tự nhận ngôn ngữ nguồn
 * (`sl=auto`) nên dùng được cho cả tiếng Anh lẫn tiếng Trung.
 */

/** Cắt bớt để không gửi nhầm cả đoạn dài lên URL. */
const MAX_DICH = 500;

export async function dichSangViet(text) {
    const q = String(text || '').trim().slice(0, MAX_DICH);
    if (!q) return '';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Không dịch được');
    const data = await res.json();
    return (data?.[0] || []).map((seg) => seg?.[0]).filter(Boolean).join('').trim();
}
