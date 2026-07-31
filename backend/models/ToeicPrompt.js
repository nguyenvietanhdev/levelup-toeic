const mongoose = require('mongoose');

/**
 * Prompt AI sinh câu hỏi TOEIC — bản GHI ĐÈ do admin sửa.
 *
 * Prompt mặc định vẫn nằm trong code (public/admin/js/features/toeic/toeic.js)
 * làm nền; document ở đây chỉ tồn tại khi admin đã sửa. Xoá document = khôi phục
 * mặc định, nên không cần lưu bản gốc hai nơi.
 *
 * key: '1'..'7' cho từng Part, 'all' cho prompt tổng hợp.
 */
const ToeicPromptSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        enum: ['1', '2', '3', '4', '5', '6', '7', 'all'],
        index: true,
    },
    content: { type: String, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
    timestamps: true,
    collection: 'toeic_prompts',
});

module.exports = mongoose.model('ToeicPrompt', ToeicPromptSchema);
