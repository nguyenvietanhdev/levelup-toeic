const mongoose = require('mongoose');

/**
 * MỘT MÀN HỎI của bài thi TOEIC.
 *
 * Thay cho mô hình cũ "1 document = 1 câu + groupId để gom nhóm":
 *   • Part 1/2/5 → `questions` có ĐÚNG 1 phần tử
 *   • Part 3/4/6/7 → `questions` có N phần tử dùng chung ngữ cảnh
 * Một hình dạng duy nhất cho mọi Part → không phải rẽ nhánh theo part ở bất kỳ
 * nơi nào đọc dữ liệu (query, chấm điểm, thống kê, admin, runner).
 *
 * Vì sao bỏ groupId: mô hình cũ phải giả định các câu cùng nhóm nằm LIỀN KỀ
 * nhau và phải tự sort theo questionIndex; đổi thứ tự là nhóm vỡ. Ở đây thứ tự
 * là thứ tự mảng nên không thể vỡ, và ngữ cảnh (audio/ảnh/đoạn văn) lưu MỘT LẦN
 * thay vì nhân bản sang từng câu.
 *
 * Định danh câu: sub-document Mongo tự sinh `_id` duy nhất toàn cục, nên
 * `ToeicAttempt.answers[].questionId` vẫn trỏ đúng một câu như trước.
 */

const OptionSchema = new mongoose.Schema({
    label: { type: String, required: true, enum: ['A', 'B', 'C', 'D'] },
    text: { type: String, required: true, trim: true },
}, { _id: false });

const SubQuestionSchema = new mongoose.Schema({
    // SỐ CÂU thật theo chuẩn TOEIC (P1 1–6, P2 7–31, P6 131–146…).
    // Nhập tay được ở admin; hiển thị trực tiếp lúc làm bài.
    number: { type: Number, required: true },

    // Part 1 và Part 6 không có câu hỏi riêng (chỉ tranh / chỗ trống + đáp án).
    questionText: { type: String, trim: true },
    questionTranslate: { type: String, trim: true },

    options: { type: [OptionSchema], required: true },
    correctAnswer: { type: String, required: true, enum: ['A', 'B', 'C', 'D'] },

    // { "A": "✅ …", "B": "❌ …" } hoặc { note: "…" }
    explanation: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Thống kê riêng từng câu
    timesUsed: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
});

const ToeicQuestionSetSchema = new mongoose.Schema({
    part: { type: Number, required: true, enum: [1, 2, 3, 4, 5, 6, 7], index: true },
    source: { type: String, trim: true, index: true }, // mã đề — gom câu thành đề thi

    // ── NGỮ CẢNH CHUNG của cả màn (lưu một lần) ──────────────────────────────
    audioUrl: { type: String, trim: true },
    audioText: { type: String, trim: true },        // transcript (chế độ đục lỗ)
    audioTranslate: { type: String, trim: true },
    imageUrls: { type: [String], default: [] },
    passages: { type: [String], default: [] },      // đoạn đọc dạng text (tùy chọn)
    passageCount: { type: Number, enum: [1, 2, 3] }, // Part 7: single/double/triple

    // ── CÁC CÂU TRONG MÀN ────────────────────────────────────────────────────
    questions: { type: [SubQuestionSchema], required: true },

    topic: { type: String, trim: true, index: true },
    tags: [{ type: String, trim: true }],

    isActive: { type: Boolean, default: true, index: true },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
    timestamps: true,
    collection: 'toeic_question_sets',
});

ToeicQuestionSetSchema.index({ source: 1, part: 1 });
ToeicQuestionSetSchema.index({ part: 1, isActive: 1, isPublished: 1 });
// Tra ngược từ id câu con → màn chứa nó (dùng khi chấm điểm / xem lại).
ToeicQuestionSetSchema.index({ 'questions._id': 1 });

/** Số câu trong màn — dùng để đếm tổng câu của đề. */
ToeicQuestionSetSchema.virtual('questionCount').get(function () {
    return this.questions?.length || 0;
});

/** Dải số câu, vd "131–134" (hoặc "5" nếu chỉ 1 câu). */
ToeicQuestionSetSchema.methods.numberRange = function () {
    const ns = (this.questions || []).map(q => q.number).filter(Number.isFinite);
    if (!ns.length) return '';
    const min = Math.min(...ns), max = Math.max(...ns);
    return min === max ? String(min) : `${min}–${max}`;
};

module.exports = mongoose.model('ToeicQuestionSet', ToeicQuestionSetSchema);
