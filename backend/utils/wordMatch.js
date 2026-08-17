/**
 * Dò xem câu người học viết có DÙNG được từ nào trong danh sách mục tiêu.
 *
 * Đây là lõi chấm điểm của chế độ Hội thoại. Cố ý KHÔNG gọi AI:
 *   · miễn phí và tức thì — tô sáng được ngay lúc người học đang gõ;
 *   · KHÁCH QUAN — AI chấm thì cùng một câu lúc được lúc không, mà người học
 *     mất thưởng vì máy đổi ý là thứ phá niềm tin nhanh nhất.
 *
 * Hai ngôn ngữ, hai luật khác hẳn nhau:
 *
 *   · TIẾNG ANH — có khoảng trắng, có biến thể đuôi (study/studied/studying).
 *     So chuỗi cứng thì người học dùng ĐÚNG mà bị báo sai.
 *   · TIẾNG TRUNG — KHÔNG có khoảng trắng, không biến thể. Phải dò chuỗi con,
 *     nhưng chính vì thế mà dễ khớp NHẦM: "好" nằm trong "你好", nên gõ "你好"
 *     mà tính luôn cả "好" là cho điểm thứ người học không chủ ý dùng.
 */

/** Bỏ dấu câu và gom khoảng trắng. Giữ nguyên chữ có dấu (tiếng Việt/Trung). */
function normalize(s) {
    return String(s || '')
        .toLowerCase()
        // Chỉ bỏ dấu câu, KHÔNG bỏ ký tự chữ — `\w` trong JS không hiểu chữ
        // tiếng Việt có dấu, dùng nó là "hiểu" thành rỗng.
        //
        // Phải kể CẢ dấu câu TOÀN PHẦN (，。！？、；：「」『』) — tiếng Trung
        // dùng bộ này chứ không dùng dấu ASCII. Thiếu chúng thì "高兴。" không
        // khớp "高兴" ở cuối câu, mà cuối câu lại là chỗ hay đặt từ nhất.
        .replace(/[.,!?;:"'’“”()\[\]{}…—–-]/g, ' ')
        .replace(/[，。！？、；：「」『』（）《》〈〉·]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Câu có chứa chữ Hán không — quyết định dùng luật nào. */
function hasHan(s) {
    return /[一-鿿]/.test(String(s || ''));
}

/**
 * Các đuôi biến thể của một từ tiếng Anh.
 *
 * Không dùng thư viện stemming: chúng cắt cụt từ (`studies` → `studi`) nên
 * không so ngược lại được với từ gốc trong kho. Ở đây làm chiều NGƯỢC lại —
 * sinh ra các dạng có thể có từ chính từ gốc, rồi dò xem câu có dạng nào.
 */
function englishForms(word) {
    const w = normalize(word);
    if (!w) return [];
    const forms = new Set([w]);

    // Cụm nhiều chữ (`look forward to`) không chia đuôi — để nguyên.
    if (w.includes(' ')) return [...forms];

    forms.add(w + 's');
    forms.add(w + 'es');
    forms.add(w + 'ed');
    forms.add(w + 'ing');
    forms.add(w + 'd');
    forms.add(w + 'r');
    forms.add(w + 'er');
    forms.add(w + 'est');

    // Đuôi `y` → `ies/ied`: study → studies, studied.
    if (w.endsWith('y') && w.length > 2) {
        const stem = w.slice(0, -1);
        forms.add(stem + 'ies');
        forms.add(stem + 'ied');
        forms.add(stem + 'ier');
        forms.add(stem + 'iest');
    }

    // Đuôi `e` → bỏ `e` khi thêm `ing/ed`: make → making, use → used.
    if (w.endsWith('e') && w.length > 2) {
        const stem = w.slice(0, -1);
        forms.add(stem + 'ing');
        forms.add(stem + 'ed');
    }

    // Gấp đôi phụ âm cuối: stop → stopped/stopping.
    if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
        const dbl = w + w[w.length - 1];
        forms.add(dbl + 'ed');
        forms.add(dbl + 'ing');
        forms.add(dbl + 'er');
    }

    return [...forms];
}

/**
 * Câu `text` có dùng từ `word` không.
 *
 * @param {string} text  Câu người học viết/nói.
 * @param {string} word  Từ mục tiêu.
 * @param {string} [lang] 'zh' | 'en'. Không truyền thì tự đoán theo chữ Hán.
 */
function usesWord(text, word, lang) {
    const t = normalize(text);
    const w = normalize(word);
    if (!t || !w) return false;

    const isZh = lang === 'zh' || (!lang && hasHan(w));

    if (isZh) {
        // Tiếng Trung không có khoảng trắng → dò chuỗi con là cách DUY NHẤT.
        // Chấp nhận khớp lồng nhau ("好" trong "你好"): tách từ tiếng Trung cho
        // đúng cần từ điển phân từ, mà sai sót của nó còn khó lường hơn.
        // Người dùng bộ từ theo buổi hiếm khi có cả hai từ lồng nhau cùng lúc.
        return t.includes(w);
    }

    // Tiếng Anh: khớp theo RANH GIỚI TỪ, không phải chuỗi con.
    // `t.includes('cat')` khớp luôn "category" — cho điểm oan.
    const words = t.split(' ');
    const forms = englishForms(w);

    for (const f of forms) {
        if (f.includes(' ')) {
            // Cụm: dò trên chuỗi đã chuẩn hoá, có đệm khoảng trắng hai đầu để
            // "to" không khớp vào giữa "tomorrow".
            if (` ${t} `.includes(` ${f} `)) return true;
        } else if (words.includes(f)) {
            return true;
        }
    }
    return false;
}

/**
 * Lọc ra những từ mục tiêu mà câu này dùng được.
 *
 * @returns {string[]} các từ (dạng GỐC như trong kho) đã dùng.
 */
function matchWords(text, targetWords = [], lang) {
    if (!text || !Array.isArray(targetWords)) return [];
    const hit = [];
    for (const w of targetWords) {
        if (usesWord(text, w, lang)) hit.push(w);
    }
    return hit;
}

/**
 * Gộp từ đã dùng qua NHIỀU lượt, không trùng lặp.
 *
 * Dùng ở server để tính thưởng: client tô sáng cho mượt, nhưng con số ăn tiền
 * phải tính lại từ toàn bộ lượt đã lưu — client sửa được thì sửa cả thưởng.
 */
function collectUsed(turns = [], targetWords = [], lang) {
    const used = new Set();
    for (const t of turns) {
        // CHỈ tính lượt của NGƯỜI HỌC. Tính cả lượt NPC thì AI tự nói hết danh
        // sách là người học được điểm tối đa mà chưa gõ chữ nào.
        if (!t || t.role !== 'user') continue;
        for (const w of matchWords(t.content, targetWords, lang)) used.add(w);
    }
    return [...used];
}

module.exports = { normalize, hasHan, englishForms, usesWord, matchWords, collectUsed };
