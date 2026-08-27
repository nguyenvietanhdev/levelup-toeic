const mongoose = require('mongoose');

/**
 * UserUpload Model — từ vựng riêng do người dùng tự tải lên.
 *
 * Trước đây dữ liệu này được nhồi chung vào collection `vocabularies`
 * với scope:'private'. Tách hẳn sang collection riêng `user_upload`
 * để vocabularies chỉ còn chứa từ vựng chung (public), tránh phải
 * lọc scope ở mọi query và tránh đụng index unique của public.
 */
const userUploadSchema = new mongoose.Schema(
    {
        // Ngôn ngữ của trường `en`. Bộ từ vựng riêng trộn lẫn tiếng Anh và tiếng
        // Trung: gõ `你会吗` vào ô Dịch nhanh rồi lưu là chữ Hán nằm trong `en`,
        // ngay cạnh những từ tiếng Anh thật. Không có trường này thì không cách
        // nào biết phải đọc bằng giọng nào — TTS đọc `你会吗` bằng giọng Anh ra
        // một tràng vô nghĩa, mà không có lỗi gì cả.
        //
        // Mặc định 'en' để 100% bản ghi cũ giữ nguyên hành vi; chỉ từ mới lưu từ
        // Dịch nhanh mới mang 'zh'. Từ cũ đã lẫn chữ Hán thì đoán bằng mặt chữ
        // (xem detectLang ở frontend), không cần backfill.
        // `bi` = bộ song ngữ. Thiếu ở enum thì Mongoose từ chối lúc lưu và
        // bộ từ riêng song ngữ không nhập được.
        lang: { type: String, enum: ['en', 'zh', 'bi'], default: 'en' },
        en: { type: String, required: true, trim: true },
        vn: { type: String, trim: true, default: '' },
        // Nghĩa tiếng Anh — chỉ bộ `lang: 'bi'` dùng tới.
        //
        // Có trường này thì MỘT bộ từ luyện được cả Trung→Việt lẫn Trung→Anh:
        // `vn` và `enMeaning` thay nhau đóng vai đáp án tuỳ chiều đang chọn.
        // Không có thì phải nhập hai bộ cho cùng một danh sách từ.
        enMeaning: { type: String, trim: true, default: '' },
        phonetic: { type: String, default: '' },
        part: { type: String, required: true, trim: true },
        synonyms: { type: String, default: '' },
        type: { type: String, default: '' },
        image: { type: String, default: '' },
        example: { type: String, default: '' },
        level: { type: String, default: '' },
        source: { type: String, required: true, trim: true },

        // Chủ sở hữu — email là khoá phân biệt người dùng (đồng bộ với WrongWord)
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        ownerEmail: {
            type: String,
            lowercase: true,
            default: null,
            index: true,
        },
        uploadBatchId: { type: String, default: '' },

        // Tự xoá khi hết hạn (TTL qua expiresAt; null = không bao giờ hết hạn)
        expiresAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'user_upload',
    }
);

// TTL: doc tự xoá khi now > expiresAt. Doc có expiresAt=null không bị xoá.
userUploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Tra cứu nhanh theo chủ sở hữu + source
userUploadSchema.index({ ownerEmail: 1, source: 1 });
userUploadSchema.index({ ownerId: 1, source: 1 });
// Khóa upsert chống trùng: 1 từ (en) / source / chủ sở hữu
userUploadSchema.index({ ownerEmail: 1, source: 1, en: 1 });

module.exports = mongoose.model('UserUpload', userUploadSchema);
