/**
 * Phiên âm cho CẢ CÂU ví dụ — IPA cho tiếng Anh, pinyin cho tiếng Trung.
 *
 * Vì sao cần: từ vựng có sẵn `phonetic` của TỪ (8397/8427 bản ghi), nhưng câu
 * ví dụ thì không bản ghi nào có. Người học nhìn thấy `/əˈtend ˈtreɪnɪŋ/` dưới
 * từ rồi nhìn xuống câu "New employees must attend training sessions." — không
 * có gì để đọc theo. Đúng chỗ họ cần nhất, vì đọc cả câu khó hơn đọc một từ.
 *
 * Vì sao ở SERVER chứ không gọi thẳng từ client như pinyin:
 *   · Pinyin tiếng Trung lấy được từ endpoint `gtx` công khai, miễn phí.
 *   · IPA tiếng Anh thì KHÔNG có nguồn miễn phí tương đương — `dt=rm` chỉ
 *     chuyển tự cho ngôn ngữ không dùng chữ Latin, gọi cho tiếng Anh trả về
 *     rỗng. Phải nhờ AI, mà gọi AI thì không để client gọi trực tiếp được.
 *   · Ở server thì CACHE dùng chung cho mọi người học: câu ví dụ là dữ liệu
 *     tĩnh, người thứ hai gặp cùng câu không phải trả tiền lần nữa.
 *
 * Cache ghi vào chính bản ghi từ vựng (`examplePhonetic`) chứ không giữ ở RAM:
 * câu ví dụ không đổi, nên phiên âm của nó cũng vĩnh viễn — tính lại sau mỗi
 * lần restart là trả tiền cho cùng một câu mãi.
 */

function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}

/** Câu có chứa chữ Hán không. */
function coChuHan(text) {
    return /[一-鿿㐀-䶿]/.test(String(text || ''));
}

/**
 * Dọn phiên âm AI trả về.
 *
 * Model hay bọc thêm lời dẫn ("Here is the IPA:") hoặc lặp lại câu gốc. Lấy
 * đúng phần trong cặp `/…/` nếu có; không có thì lấy cả chuỗi đã cắt gọn.
 *
 * Trả '' khi không dùng được — KHÔNG trả chuỗi rác: phiên âm sai còn tệ hơn
 * không có, vì người học sẽ đọc theo nó.
 */
function donPhienAm(raw, isZh) {
    let s = String(raw || '').trim();
    if (!s) return '';

    // Bỏ lời dẫn kiểu "IPA: ..." / "Pinyin: ..."
    s = s.replace(/^[A-Za-z\s]{0,20}:\s*/, '').trim();

    if (!isZh) {
        // Lấy phần trong /…/ nếu model bọc.
        const m = s.match(/\/([^/]+)\//);
        if (m) s = m[1].trim();
        // Chuỗi không có ký tự IPA nào thì gần như chắc chắn model trả nhầm
        // (lặp lại câu tiếng Anh). Ký tự Latin thuần không phải phiên âm.
        if (!/[ˈˌːəɪʊæɑɔɜʌθðʃʒŋ]/.test(s)) return '';
    }

    // Chặn độ dài: phiên âm dài gấp mấy lần câu gốc nghĩa là model đã kèm giải
    // thích, và một đoạn văn xuôi hiện dưới câu ví dụ thì vô nghĩa.
    if (s.length > 400) return '';
    return s;
}

/**
 * Lấy phiên âm cho một câu.
 *
 * @returns {Promise<{success:boolean, phonetic?:string, error?:string}>}
 */
async function layPhienAmCau({ cau = '', userId = null } = {}) {
    const text = String(cau || '').trim();
    if (!text) return { success: false, error: 'Câu rỗng' };
    // Chặn câu quá dài TRƯỚC khi gọi AI: câu ví dụ thật dài nhất trong kho
    // khoảng 30 từ, dài hơn nữa là dữ liệu hỏng hoặc ai đó gửi cả đoạn văn.
    if (text.length > 300) return { success: false, error: 'Câu quá dài' };

    const zh = coChuHan(text);
    const system = zh
        ? [
            'You convert Chinese sentences to Hanyu Pinyin.',
            'Reply with ONLY the pinyin, nothing else.',
            // Dấu thanh là thứ quan trọng nhất — pinyin không dấu thì không đọc
            // đúng được, mà sai thanh là sai nghĩa.
            'Always include tone marks (ǎ, ó, ì…), never tone numbers.',
        ].join('\n')
        : [
            'You convert English sentences to IPA phonetic transcription.',
            'Reply with ONLY the IPA, nothing else. No slashes, no explanation.',
            'Use General American pronunciation with primary stress marks (ˈ).',
        ].join('\n');

    const res = await chatCompletion(
        [{ role: 'system', content: system }, { role: 'user', content: text }],
        {
            maxTokens: 200,
            // Nhiệt độ 0: phiên âm của một câu là một đáp án cố định, không có
            // chỗ cho sáng tạo. Cùng câu phải ra cùng kết quả giữa các lần.
            temperature: 0,
            feature: 'sentence-phonetic',
            userId,
        }
    );
    if (!res.success) return { success: false, error: res.error };

    const phonetic = donPhienAm(res.content, zh);
    if (!phonetic) return { success: false, error: 'Phiên âm không đọc được' };
    return { success: true, phonetic, lang: zh ? 'zh' : 'en' };
}

module.exports = { layPhienAmCau, donPhienAm, coChuHan };
