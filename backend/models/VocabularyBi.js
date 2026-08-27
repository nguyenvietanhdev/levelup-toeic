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
 * ── Vì sao KHÔNG có `vn` ───────────────────────────────────────────────────
 *
 * Kho này học Trung ↔ Anh, không qua tiếng Việt: hỏi 你好 thì đáp `hello`.
 * `en` chính là đáp án, nên nghĩa tiếng Việt không ai đọc tới.
 *
 * 13/16 chế độ đọc `word.vn` làm đáp án, nhưng chúng không cần biết điều đó:
 * `vocabBiMapper` đặt MẶT KIA vào ô `vn` khi phục vụ. Chế độ thấy một cặp
 * (từ, nghĩa) như mọi khi — chỉ là "nghĩa" ở đây bằng tiếng Anh.
 *
 * Nghĩa tiếng Việt vẫn có chỗ của nó: kho "Từ vựng riêng" của người dùng lưu
 * đủ cả ba key.
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
        // ── Hai ngôn ngữ ───────────────────────────────────────────────────
        // Kho này học Trung ↔ Anh: hỏi 你好, đáp `hello`. `en` CHÍNH LÀ đáp
        // án, nên không cần nghĩa tiếng Việt — lưu thêm một key không ai đọc
        // là lãng phí.
        zh: { type: String, required: true, trim: true },
        en: { type: String, required: true, trim: true },

        /**
         * Mặt nào là "từ phải nhớ" khi luyện.
         *
         * `zh` → hỏi 你好, đáp `hello`, loa đọc giọng Trung.
         * `en` → hỏi `hello`, đáp 你好, loa đọc giọng Anh.
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
