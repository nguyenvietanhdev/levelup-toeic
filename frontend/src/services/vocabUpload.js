// ===================================
// VOCAB UPLOAD SERVICE
// ===================================
// Pure normalization for uploaded vocabulary items, extracted from the
// inline `normalize` closure in TopNav.jsx (used at 3 call sites).
// The upload modal's DOM/markup wiring stays in TopNav for now — that
// component split is a later phase.

const lower = s => (s || '').toLowerCase().trim();
const upper = s => (s || '').toUpperCase().trim();
const capFirst = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/**
 * Normalize a raw vocabulary object to the canonical casing rules:
 * most fields lowercased, part/level uppercased, example sentence-cased.
 * Behaviour identical to the previous inline `normalize`.
 */
export function normalizeVocabItem(obj) {
    return {
        // `lang` quyết định GIỌNG ĐỌC của từ (models/UserUpload.js). Bỏ qua nó thì
        // mọi từ nhập bằng JSON mặc định 'en' — chữ Hán đọc bằng giọng Anh, ra
        // một tràng vô nghĩa mà không có lỗi nào. Prompt cho AI đã yêu cầu trả về
        // trường này; không nhận ở đây là hứa suông.
        //
        // Không có `lang` thì ĐOÁN theo mặt chữ, đừng mặc định 'en': file JSON cũ
        // (viết trước khi có trường này) vẫn phải đọc đúng giọng.
        // `bi` (bộ song ngữ) cũng là giá trị hợp lệ. Thiếu nó ở đây thì bộ song
        // ngữ rơi xuống nhánh đoán, mà nó toàn chữ Hán nên bị ép thành 'zh' —
        // mất nhãn riêng và lẫn vào danh sách bộ tiếng Trung.
        lang: ['zh', 'en', 'bi'].includes(obj.lang)
            ? obj.lang
            : (/[一-鿿]/.test(String(obj.en || '')) ? 'zh' : 'en'),
        en: lower(obj.en),
        vn: lower(obj.vn),
        // Nghĩa tiếng Anh — bộ song ngữ dùng làm đáp án khi luyện Trung → Anh.
        // Không liệt kê ở đây thì nó bị lọc mất trước cả khi tới server.
        enMeaning: lower(obj.enMeaning),
        part: upper(obj.part),
        source: lower(obj.source),
        type: lower(obj.type),
        level: upper(obj.level),
        phonetic: lower(obj.phonetic),
        example: obj.example ? capFirst(obj.example.trim()) : '',
        synonyms: lower(obj.synonyms),
        image: lower(obj.image || ''),
    };
}
