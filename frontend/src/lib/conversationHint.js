/**
 * Gợi ý cách trả lời cho câu AI vừa nói trong Hội thoại.
 *
 * Mục đích là LUYỆN PHẢN XẠ: đưa KHUNG CÂU có chỗ trống `___` để người học tự
 * điền, không đưa câu trả lời hoàn chỉnh.
 *
 * Hai nguồn, theo thứ tự ưu tiên:
 *   1. Khung AI viết kèm chính câu nó vừa nói (dòng HINT, server tách sẵn vào
 *      `turn.khung`) — bám đúng ngữ cảnh, không tốn thêm lần gọi AI nào.
 *   2. Không có thì dựng bằng LUẬT ở client: tìm CÂU HỎI CUỐI trong lời AI (lời
 *      AI hay mở bằng câu chào, "Good morning, welcome… Who are you?" — xét đầu
 *      câu là bắt nhầm), nhận dạng dạng câu hỏi, đưa 2–3 khung tương ứng.
 *
 * Từ mục tiêu CHƯA dùng được gợi ý kèm theo, để người học biết nên nhét từ nào.
 */

/**
 * Các dạng câu hỏi, xét theo thứ tự — dạng CỤ THỂ đứng trước dạng chung
 * ("How are you" trước "How", "Who are you" trước "Who").
 */
const DANG_CAU_HOI = [
    {
        loai: 'Hỏi thăm',
        test: /^\s*how are you\b|^\s*how('s| is) (it going|your day|everything)\b/i,
        khung: ["I'm ___, thank you. And you?", "Not bad. I've been ___ lately."],
    },
    {
        loai: 'Giới thiệu',
        test: /^\s*(who are you|what('s| is) your name|may i (have|know) your name|can you introduce yourself)\b/i,
        khung: ['My name is ___. I am a ___.', "I'm ___, and I'm here to ___."],
    },
    {
        loai: 'Quê quán',
        test: /^\s*where (are|do) you (from|come from|live)\b/i,
        khung: ["I'm from ___.", 'I live in ___, near ___.'],
    },
    {
        loai: 'Nghề nghiệp',
        test: /^\s*what do you do( for a living)?\s*\?*\s*$|^\s*what('s| is) your (job|work|position)\b/i,
        khung: ['I work as a ___ at ___.', "I'm a ___. I mainly ___."],
    },
    {
        loai: 'Mời / đề nghị',
        test: /^\s*(would you like|do you want|shall i|can i get you|how about|what about)\b/i,
        khung: ["Yes, I'd like ___, please.", "No, thanks. I'd prefer ___."],
    },
    {
        loai: 'Nhờ / yêu cầu',
        test: /^\s*(can|could|would|will) you\b/i,
        khung: ['Sure, I can ___.', "Sorry, I can't ___ because ___."],
    },
    {
        loai: 'Lựa chọn',
        test: /\b(or)\b.*\?\s*$|^\s*which\b|\bprefer\b/i,
        khung: ['I prefer ___ because ___.', "I'd choose ___, since ___."],
    },
    {
        loai: 'Ý kiến',
        test: /\bwhat do you think\b|\bhow do you feel\b|\byour opinion\b/i,
        khung: ['I think ___ because ___.', 'In my opinion, ___. For example, ___.'],
    },
    {
        loai: 'Số lượng / giá',
        test: /^\s*how (much|many)\b/i,
        khung: ["It's about ___.", 'I need ___, please.'],
    },
    {
        loai: 'Tần suất',
        test: /\bhow often\b|\bhow many times\b|\bhow long\b/i,
        khung: ['I usually ___ (every day / once a week).', "I've been ___ for ___."],
    },
    {
        loai: 'Thời gian',
        test: /^\s*(when|what time)\b/i,
        khung: ['I usually ___ at / on ___.', "I'm planning to ___ next ___."],
    },
    {
        loai: 'Có / Không',
        test: /^\s*(do|does|did|is|are|was|were|have|has|can|could|will|would|should|am)\b/i,
        khung: ["Yes, I (do / am) ___. Actually, ___.", "No, I (don't / am not) ___, but ___."],
    },
    {
        loai: 'Địa điểm',
        test: /^\s*where\b/i,
        khung: ['I usually ___ in / at ___.', "It's near ___."],
    },
    {
        loai: 'Lý do',
        test: /^\s*why\b/i,
        khung: ['Because ___.', 'I ___ because ___.'],
    },
    {
        loai: 'Cách làm',
        test: /^\s*how\b/i,
        khung: ['I ___ by ___.', 'First I ___, then I ___.'],
    },
    {
        loai: 'Sự việc',
        test: /^\s*(what|which|who)\b/i,
        khung: ['I think ___ is ___ because ___.', 'It is ___.'],
    },
];

const KHUNG_MAC_DINH = {
    loai: 'Mở',
    khung: ['I think ___ because ___.', 'Well, ___. What about you?'],
};

/** Số từ gợi ý tối đa — nhiều hơn thì chip chiếm chỗ mà không giúp thêm. */
const SO_TU_GOI_Y = 4;

/**
 * Câu cần trả lời trong lời AI: câu hỏi CUỐI cùng (kết thúc bằng ? hoặc ？);
 * không có câu hỏi thì lấy câu cuối.
 */
export function cauHoiCuoi(loi) {
    const text = String(loi || '').trim();
    if (!text) return '';
    const cau = text.split(/(?<=[.!?。！？])\s*/).map((c) => c.trim()).filter(Boolean);
    const hoi = cau.filter((c) => /[?？]\s*$/.test(c));
    return (hoi.length ? hoi[hoi.length - 1] : cau[cau.length - 1]) || '';
}

/**
 * @param {string}   loiAI      câu AI vừa nói (nguyên văn, có thể nhiều câu)
 * @param {string[]} tuMucTieu  toàn bộ từ cần dùng của phiên
 * @param {string[]} tuDaDung   từ người học đã dùng (đã khớp)
 * @param {string[]} khungAI    khung AI viết kèm lượt đó (nếu có)
 * @returns {{ loai: string, cauHoi: string, khung: string, cacKhung: string[], tuAI: boolean, tuGoiY: string[] }}
 */
export function goiYCauTraLoi(loiAI, tuMucTieu = [], tuDaDung = [], khungAI = []) {
    const cauHoi = cauHoiCuoi(loiAI);
    const daDung = new Set(tuDaDung);
    const tuGoiY = tuMucTieu.filter((w) => !daDung.has(w)).slice(0, SO_TU_GOI_Y);

    const tuAI = (Array.isArray(khungAI) ? khungAI : []).filter((k) => typeof k === 'string' && k.trim());
    if (tuAI.length) {
        return { loai: 'Theo câu AI vừa hỏi', cauHoi, khung: tuAI[0], cacKhung: tuAI, tuAI: true, tuGoiY };
    }

    const dang = DANG_CAU_HOI.find((d) => d.test.test(cauHoi)) || KHUNG_MAC_DINH;
    return { loai: dang.loai, cauHoi, khung: dang.khung[0], cacKhung: dang.khung, tuAI: false, tuGoiY };
}
