/**
 * Phiên âm cho CẢ CÂU — pinyin cho tiếng Trung, IPA cho tiếng Anh.
 *
 * Vì sao gọi Google chứ không lưu sẵn trong DB: 12.762 từ tiếng Trung đều có
 * `example` nhưng KHÔNG bản ghi nào có phiên âm câu (`phonetic` chỉ là phiên âm
 * của một từ). Sinh sẵn cho toàn kho là một lần chạy lớn và phải chạy lại mỗi
 * lần thêm từ; gọi lúc cần thì chỉ tốn đúng câu đang hiện.
 *
 * Dùng chung endpoint `gtx` với popup Dịch nhanh — không cần API key, không tốn
 * token AI. Khác ở tham số: `dt=rm` (romanization) thay vì `dt=t` (translation).
 * Google trả pinyin CÓ DẤU THANH: "对不起，我迟到了。" → "Duìbùqǐ, wǒ chídàole."
 *
 * Dấu thanh là thứ quan trọng nhất với người học tiếng Trung — pinyin không dấu
 * (duibuqi) thì không đọc được đúng, mà sai thanh là sai nghĩa.
 */

/** Cache trong phiên: cùng một câu hiện lại nhiều lần thì chỉ gọi một lần. */
const _cache = new Map();

/** Câu có chứa chữ Hán không. Câu tiếng Anh thì không cần phiên âm. */
export function coChuHan(text) {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(String(text || ''));
}

/**
 * Lấy pinyin của một câu tiếng Trung.
 *
 * @returns {Promise<string>} chuỗi pinyin, hoặc '' nếu không lấy được.
 *   KHÔNG ném lỗi: đây là thông tin phụ trợ, hỏng thì ẩn đi chứ không được làm
 *   vỡ màn luyện tập đang chạy.
 */
export async function layPinyinCau(text) {
    const cau = String(text || '').trim();
    if (!cau || !coChuHan(cau)) return '';
    if (_cache.has(cau)) return _cache.get(cau);

    const url = 'https://translate.googleapis.com/translate_a/single'
        + '?client=gtx&sl=zh-CN&tl=vi&dt=t&dt=rm&q=' + encodeURIComponent(cau);

    // Huỷ sau 4s — cùng lý do với `translateToVi`: gtx bị giới hạn tần suất thì
    // fetch treo tích luỹ, mà đây chỉ là thông tin phụ.
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return '';
        const data = await res.json();
        // Phiên âm nằm ở phần tử thứ 4 của mỗi đoạn: [dịch, gốc, null, pinyin].
        const out = (data[0] || []).map((seg) => seg?.[3]).filter(Boolean).join(' ').trim();
        if (_cache.size > 300) _cache.clear();   // chặn cache phình
        _cache.set(cau, out);
        return out;
    } catch {
        return '';   // mạng hỏng / quá hạn → ẩn phiên âm, không báo lỗi
    } finally {
        clearTimeout(to);
    }
}

/**
 * Phiên âm cho câu BẤT KỲ ngôn ngữ nào — đây là hàm nên dùng.
 *
 * Tiếng Trung đi đường `gtx` công khai (miễn phí, không cần đăng nhập).
 * Tiếng Anh đi `/api/phonetic/sentence` vì IPA không có nguồn miễn phí tương
 * đương: `dt=rm` chỉ chuyển tự cho ngôn ngữ không dùng chữ Latin, gọi cho tiếng
 * Anh trả về rỗng. Server sinh bằng AI rồi CACHE vào bản ghi từ vựng, nên câu
 * đó về sau miễn phí cho mọi người học.
 *
 * Một hàm cho cả hai ngôn ngữ chứ không để mỗi chế độ tự phân nhánh: 12 chế độ
 * hiện câu ví dụ, mà chỉ Trắc nghiệm có phiên âm — đúng kiểu lệch mà một hàm
 * dùng chung ngăn được.
 *
 * @returns {Promise<string>} phiên âm, hoặc '' nếu không lấy được. KHÔNG ném
 *   lỗi: đây là thông tin phụ trợ, hỏng thì ẩn đi chứ không làm vỡ bài đang chạy.
 */
export async function layPhienAmCau(text) {
    const cau = String(text || '').trim();
    if (!cau) return '';
    if (coChuHan(cau)) return layPinyinCau(cau);

    if (_cache.has(cau)) return _cache.get(cau);
    try {
        const res = await fetch(`/api/phonetic/sentence?text=${encodeURIComponent(cau)}`);
        if (!res.ok) return '';
        const data = await res.json();
        const out = String(data?.data?.phonetic || '').trim();
        if (_cache.size > 300) _cache.clear();
        _cache.set(cau, out);
        return out;
    } catch {
        return '';
    }
}
