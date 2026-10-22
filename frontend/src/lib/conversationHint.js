/**
 * Gợi ý cách trả lời cho câu AI vừa hỏi trong Hội thoại.
 *
 * Chạy hoàn toàn ở client, không gọi AI: nhận dạng dạng câu hỏi bằng từ khoá
 * đầu câu, rồi đưa ra khung câu trả lời tương ứng. Từ mục tiêu CHƯA dùng được
 * gợi ý kèm theo, để người học biết nên nhét từ nào vào chỗ trống.
 *
 * Đây là gợi ý cấu trúc, không phải câu mẫu đúng ngữ cảnh — câu mẫu đúng ngữ
 * cảnh cần AI, và sẽ làm sau khi thấy người học có dùng phần này không.
 */

/** Các dạng câu hỏi, xét theo thứ tự — dạng cụ thể đứng trước dạng chung. */
const DANG_CAU_HOI = [
    {
        loai: 'Có / Không',
        test: /^\s*(do|does|did|is|are|was|were|have|has|can|could|will|would|should)\b/i,
        khung: "Yes, I (do / don't) ___ because ___.",
    },
    {
        loai: 'Tần suất',
        test: /\bhow often\b|\bhow many times\b|\bhow long\b/i,
        khung: 'I usually ___ (every day / once a week / for ___).',
    },
    {
        loai: 'Địa điểm',
        test: /^\s*where\b/i,
        khung: 'I usually ___ in / at ___.',
    },
    {
        loai: 'Lý do',
        test: /^\s*why\b/i,
        khung: 'I ___ because ___.',
    },
    {
        loai: 'Cách làm',
        test: /^\s*how\b/i,
        khung: 'I ___ by ___.',
    },
    {
        loai: 'Sự việc',
        test: /^\s*(what|which|who)\b/i,
        khung: 'I think ___ is ___ because ___.',
    },
];

const KHUNG_MAC_DINH = { loai: 'Mở', khung: 'I think ___ because ___.' };

/** Số từ gợi ý tối đa — nhiều hơn thì chip chiếm chỗ mà không giúp thêm. */
const SO_TU_GOI_Y = 4;

/**
 * @param {string} cauHoi   câu AI vừa nói (lấy nguyên văn, không cần tách câu)
 * @param {string[]} tuMucTieu toàn bộ từ cần dùng của phiên
 * @param {string[]} tuDaDung từ người học đã dùng (đã khớp)
 * @returns {{ loai: string, khung: string, tuGoiY: string[] }}
 */
export function goiYCauTraLoi(cauHoi, tuMucTieu = [], tuDaDung = []) {
    const text = String(cauHoi || '').trim();
    const dang = DANG_CAU_HOI.find((d) => d.test.test(text)) || KHUNG_MAC_DINH;

    const daDung = new Set(tuDaDung);
    const tuGoiY = tuMucTieu.filter((w) => !daDung.has(w)).slice(0, SO_TU_GOI_Y);

    return { loai: dang.loai, khung: dang.khung, tuGoiY };
}
