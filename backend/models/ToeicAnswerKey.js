const mongoose = require('mongoose');

/**
 * BỘ ĐÁP ÁN của một mã đề — tách khỏi câu hỏi có chủ đích.
 *
 * Đáp án gốc quét từ ảnh đề in được giữ nguyên ở đây, không ghi đè thẳng vào
 * `ToeicQuestionSet.questions[].correctAnswer`. Nhờ vậy:
 *   • Quét một lần, đối chiếu lại bất cứ lúc nào (thêm câu mới vẫn soi được)
 *   • Biết đáp án trong đề đang LỆCH so với bản gốc chứ không âm thầm đè
 *   • Quét lại không cần tải ảnh lần nữa
 *
 * `answers` là Map "số câu" → "A|B|C|D" (Mongo lưu key dạng chuỗi).
 */
const toeicAnswerKeySchema = new mongoose.Schema(
    {
        source: { type: String, required: true, unique: true, trim: true, index: true },
        answers: {
            type: Map,
            of: { type: String, enum: ['A', 'B', 'C', 'D'] },
            default: () => new Map(),
        },
        // Dải câu đã quét, để biết bộ đáp án phủ tới đâu (vd "1-100", "101-200").
        scannedRanges: { type: [String], default: [] },
        note: { type: String, trim: true, default: '' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, collection: 'toeic_answer_keys' },
);

/** Số câu đã có đáp án. */
toeicAnswerKeySchema.virtual('count').get(function () {
    return this.answers ? this.answers.size : 0;
});

toeicAnswerKeySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('ToeicAnswerKey', toeicAnswerKeySchema);
