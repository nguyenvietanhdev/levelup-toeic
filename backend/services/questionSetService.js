/**
 * Cầu nối giữa mô hình MỚI (ToeicQuestionSet: 1 doc = 1 màn, câu nằm trong
 * mảng questions[]) và phần còn lại của hệ thống vốn làm việc theo TỪNG CÂU.
 *
 * Ý tưởng then chốt: sub-document Mongo có `_id` duy nhất toàn cục, nên một
 * `questionId` vẫn trỏ đúng một câu như mô hình cũ. Ở đây chỉ đổi CÁCH TRA CỨU.
 *
 * `flattenQuestion` trả về đúng hình dạng mà controller/frontend đang dùng
 * (kèm groupId = id của set) → đấu nối được mà không phải sửa runner.
 */
const ToeicQuestionSet = require('../models/ToeicQuestionSet');

/**
 * Dàn một câu con thành object "câu hỏi" đầy đủ: gộp ngữ cảnh CHUNG của màn
 * (audio/ảnh/đoạn văn) vào từng câu, đúng như dữ liệu cũ từng lưu lặp.
 */
function flattenQuestion(set, q, index = 0) {
    return {
        _id: q._id,
        part: set.part,
        source: set.source,
        questionNumber: q.number,
        questionText: q.questionText || '',
        questionTranslate: q.questionTranslate || '',
        options: (q.options || []).map(o => ({ label: o.label, text: o.text })),
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || {},
        // Ngữ cảnh chung của cả màn
        audioUrl: set.audioUrl || '',
        audioText: set.audioText || '',
        audioTranslate: set.audioTranslate || '',
        imageUrls: set.imageUrls || [],
        passages: set.passages || [],
        passageCount: set.passageCount,
        // Gom nhóm: cả màn dùng chung id của set. Runner đang gom theo groupId
        // nên giữ tên này để không phải sửa frontend ở giai đoạn này.
        groupId: String(set._id),
        questionIndex: index + 1,
        setSize: (set.questions || []).length,
    };
}

/** Dàn phẳng cả một màn thành mảng câu. */
function flattenSet(set) {
    return (set.questions || []).map((q, i) => flattenQuestion(set, q, i));
}

/** Dàn phẳng nhiều màn, giữ nguyên thứ tự màn và thứ tự câu trong màn. */
function flattenSets(sets) {
    return sets.flatMap(flattenSet);
}

// ── THỨ TỰ CÂU HỎI ─────────────────────────────────────────────────────────
// `part.questions` là mảng tham chiếu màn, lưu theo thứ tự ADMIN THÊM VÀO —
// không phải thứ tự đề thi. Duyệt thẳng mảng đó là người thi thấy câu nhảy lung
// tung (đề Full Test thật có 43 chỗ nhảy lùi: Part 1 ra 2,4,1,3,5,6…).
// Số câu chuẩn TOEIC đã nằm sẵn ở `question.number` nên chỉ cần sắp theo nó.

/** Số câu nhỏ nhất trong một màn (null nếu màn chưa câu nào có số). */
function minQuestionNumber(set) {
    let min = null;
    for (const q of set?.questions || []) {
        const n = Number(q?.number);
        if (Number.isFinite(n) && (min === null || n < min)) min = n;
    }
    return min;
}

/**
 * Sắp xếp ỔN ĐỊNH theo khoá số; phần tử không có số giữ nguyên thứ tự cũ và
 * dồn xuống cuối — dữ liệu thiếu số câu thì để nguyên còn hơn xáo bừa.
 */
function stableSortByNumber(list, keyOf) {
    return list
        .map((item, i) => ({ item, i, key: keyOf(item) }))
        .sort((a, b) => {
            if (a.key === null) return b.key === null ? a.i - b.i : 1;
            if (b.key === null) return -1;
            return a.key === b.key ? a.i - b.i : a.key - b.key;
        })
        .map(x => x.item);
}

/**
 * Dàn phẳng TOÀN BỘ câu của một đề, ĐÚNG THỨ TỰ THI: part tăng dần → màn theo
 * số câu nhỏ nhất → câu theo số câu. Gán luôn globalQuestionNumber + section.
 *
 * Màn nhóm (Part 3/4/6/7) vẫn liền khối vì sắp theo số nhỏ nhất của cả màn,
 * không xé lẻ từng câu.
 *
 * @param {object} test  document ToeicTest đã populate('parts.questions')
 * @param {object} [opts]
 * @param {boolean} [opts.includeAnswers=false] giữ correctAnswer (chế độ điền từ)
 * @returns {Array} mảng câu đã dàn phẳng
 */
function buildTestQuestions(test, { includeAnswers = false } = {}) {
    // Dải số câu chuẩn TOEIC — chỉ dùng khi dữ liệu THIẾU số câu.
    const PART_START = { 1: 1, 2: 7, 3: 32, 4: 71, 5: 101, 6: 131, 7: 147 };

    const parts = [...(test?.parts || [])].sort(
        (a, b) => (Number(a?.partNumber) || 0) - (Number(b?.partNumber) || 0),
    );

    const out = [];
    let globalQuestionNumber = 0;

    for (const part of parts) {
        const sets = (part.questions || [])
            .filter(Boolean)   // tham chiếu hỏng (màn đã bị xoá)
            .map(s => (typeof s.toObject === 'function' ? s.toObject() : s));

        let partQuestionIndex = 0;
        for (const set of stableSortByNumber(sets, minQuestionNumber)) {
            const ordered = {
                ...set,
                questions: stableSortByNumber(set.questions || [], q => {
                    const n = Number(q?.number);
                    return Number.isFinite(n) ? n : null;
                }),
            };

            for (const q of flattenSet(ordered)) {
                // Số câu THẬT đã chuẩn TOEIC (P6 = 131…) thì dùng luôn; thiếu số
                // mới quay lại cách đánh theo vị trí.
                if (Number.isFinite(q.questionNumber)) {
                    globalQuestionNumber = q.questionNumber;
                } else if (test.testType === 'full-test' || test.testType === 'full') {
                    globalQuestionNumber = (PART_START[part.partNumber] || 1) + partQuestionIndex;
                } else {
                    globalQuestionNumber++;
                }

                if (!includeAnswers) delete q.correctAnswer;
                q.globalQuestionNumber = globalQuestionNumber;
                q.section = Number(part.partNumber) <= 4 ? 'listening' : 'reading';

                out.push(q);
                partQuestionIndex++;
            }
        }
    }
    return out;
}

/** Tổng số CÂU của một danh sách màn (khác số lượng document). */
function countQuestions(sets) {
    return sets.reduce((n, s) => n + (s.questions?.length || 0), 0);
}

/** Tra một câu theo id câu con. Trả về câu đã dàn phẳng, hoặc null. */
async function findQuestionById(subId) {
    const set = await ToeicQuestionSet.findOne({ 'questions._id': subId }).lean();
    if (!set) return null;
    const idx = set.questions.findIndex(q => String(q._id) === String(subId));
    if (idx < 0) return null;
    return flattenQuestion(set, set.questions[idx], idx);
}

/**
 * Tra NHIỀU câu cùng lúc (1 query) → Map(subId → câu đã dàn phẳng).
 * Dùng cho chấm điểm và màn xem lại, tránh N truy vấn.
 */
async function findQuestionsByIds(subIds) {
    const ids = [...new Set(subIds.filter(Boolean).map(String))];
    if (!ids.length) return new Map();
    const sets = await ToeicQuestionSet.find({ 'questions._id': { $in: ids } }).lean();
    const map = new Map();
    for (const set of sets) {
        set.questions.forEach((q, i) => {
            const key = String(q._id);
            if (ids.includes(key)) map.set(key, flattenQuestion(set, q, i));
        });
    }
    return map;
}

/**
 * Ghi thống kê cho MỘT câu (sub-document). Cập nhật nguyên tử bằng toán tử
 * vị trí `$` — không tải cả màn về rồi save, tránh ghi đè lẫn nhau khi nhiều
 * người nộp bài cùng lúc.
 */
async function recordAnswerStat(subId, isCorrect) {
    if (!subId) return;
    await ToeicQuestionSet.updateOne(
        { 'questions._id': subId },
        {
            $inc: {
                'questions.$.timesUsed': 1,
                [`questions.$.${isCorrect ? 'correctCount' : 'wrongCount'}`]: 1,
            },
        }
    );
}

module.exports = {
    recordAnswerStat,
    flattenQuestion,
    flattenSet,
    flattenSets,
    buildTestQuestions,
    minQuestionNumber,
    stableSortByNumber,
    countQuestions,
    findQuestionById,
    findQuestionsByIds,
};
