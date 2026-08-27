const mongoose = require('mongoose');

/**
 * KHO TỪ SONG NGỮ — một bản ghi mang CẢ tiếng Trung lẫn tiếng Anh.
 *
 * Tách hẳn khỏi `vocabularies_en` / `vocabularies_zh`, không ghép, không tham
 * chiếu sang hai kho đó. Dữ liệu nạp tay.
 *
 * ── Vì sao KHÔNG gộp vào hai kho cũ ────────────────────────────────────────
 *
 * Đã đo trên dữ liệu thật: 12.762 bản ghi tiếng Trung có `en` rỗng 100%, và
 * hai kho lệch hẳn chủ đề (zh là chào hỏi cơ bản, en là TOEIC thương mại). Ghép
 * tự động cho ra 0 cặp. Bảng riêng nạp tay là đường đi đúng.
 *
 * ── Vì sao `vn` PHẢI có ────────────────────────────────────────────────────
 *
 * `vn` không phải chú thích mà là ĐÁP ÁN: 13/16 chế độ đọc `word.vn`, và
 * `generateMultipleChoice` lấy thẳng nó làm đáp án đúng lẫn ba đáp án nhiễu.
 * Thiếu `vn` thì Trắc nghiệm hiện bốn ô rỗng.
 *
 * ── Vì sao có `hienThi` thay vì thêm giá trị vào `vocabLang` ───────────────
 *
 * Toàn hệ thống có 94 chỗ viết dạng `lang === 'zh' ? zh : en` — nhị phân cứng.
 * Thêm `vocabLang: 'bi'` thì mọi chỗ đó âm thầm rơi về `'en'`: `ttsLang()` trả
 * `en-US` nên bấm loa vào 你好 sẽ đọc bằng giọng Anh, nghe không ra chữ nào.
 *
 * Nên bản ghi tự khai mặt nào là "từ chính" (`hienThi`). Controller ánh xạ nó
 * sang `en`/`zh` khi phục vụ, và 94 chỗ kia không phải đụng tới.
 */
const vocabularyBiSchema = new mongoose.Schema(
    {
        // ── Ba ngôn ngữ ────────────────────────────────────────────────────
        zh: { type: String, required: true, trim: true },
        en: { type: String, required: true, trim: true },
        vn: { type: String, required: true, trim: true },

        /**
         * Mặt nào là "từ phải nhớ" khi luyện.
         *
         * `zh` → hỏi 你好, đáp "Xin chào", loa đọc giọng Trung.
         * `en` → hỏi hello, đáp "Xin chào", loa đọc giọng Anh.
         *
         * Đọc sai giọng thì cả chế độ Nghe lẫn Phát âm đều vô dụng, nên đây là
         * trường bắt buộc chứ không đoán từ nội dung.
         */
        hienThi: {
            type: String,
            enum: ['zh', 'en'],
            default: 'zh',
        },

        // ── Phiên âm: MỘT bản ghi có HAI từ cần đọc ─────────────────────────
        // Hai kho cũ chỉ cần `phonetic` vì mỗi bản ghi một ngôn ngữ. Ở đây phải
        // tách đôi, nếu không thì hiện pinyin cạnh từ tiếng Anh.
        phoneticZh: { type: String, default: '' },
        phoneticEn: { type: String, default: '' },

        // ── Câu ví dụ ──────────────────────────────────────────────────────
        exampleZh: { type: String, default: '' },
        exampleEn: { type: String, default: '' },
        exampleVn: { type: String, default: '' },

        // Phiên âm CỦA CÂU ví dụ. Sinh bằng AI lúc cần rồi lưu lại — câu ví dụ
        // là dữ liệu tĩnh nên phiên âm của nó vĩnh viễn đúng, tính lại mỗi lần
        // là trả tiền cho cùng một câu mãi. Rỗng = chưa sinh bao giờ.
        examplePhoneticZh: { type: String, default: '' },
        examplePhoneticEn: { type: String, default: '' },

        // ── Phân nhóm ──────────────────────────────────────────────────────
        // `part` là đơn vị chọn đề ở popup, giống hệt hai kho cũ.
        part: { type: String, required: true, trim: true },
        type: { type: String, default: '' },
        level: { type: String, default: '' },
        source: { type: String, required: true, trim: true },
        image: { type: String, default: '' },
    },
    {
        timestamps: true,
        collection: 'vocabularies_bi',
    }
);

// ── INDEX: chỉ khai cho truy vấn THẬT SỰ chạy ──────────────────────────────
//
// `vocabularies_en` khai 9 index và trả giá: 8.536 từ, data 1,8 MB nhưng index
// 5,8 MB — gấp 3,2 lần. Phần lớn phục vụ upload cá nhân (ownerId, ownerEmail,
// uploadBatchId, expiresAt, scope) mà kho này không có: nạp tay, toàn bộ public.
//
// Không phải sợ hết 512 MB — còn 489 MB trống. Mà vì M0 chật RAM hơn chật đĩa:
// index thừa vẫn nằm trong working set, và đó mới là thứ làm app chậm trước.

// Lọc theo đề — truy vấn nóng nhất, chạy mỗi lần mở popup chọn Part.
vocabularyBiSchema.index({ source: 1, part: 1 });

// Chống nạp trùng khi import lại nhiều lần. Unique theo (source + zh) chứ
// không theo `zh` trần: cùng một chữ Hán có thể xuất hiện ở hai bộ khác nhau
// với nghĩa/ví dụ khác nhau, chặn hẳn là chặn nhầm.
vocabularyBiSchema.index({ source: 1, zh: 1 }, { unique: true });

module.exports = mongoose.model('VocabularyBi', vocabularyBiSchema);
