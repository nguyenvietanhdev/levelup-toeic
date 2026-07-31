const ToeicAnswerKey = require('../models/ToeicAnswerKey');
const ToeicQuestionSet = require('../models/ToeicQuestionSet');
const { parseRange, parseAnswerText } = require('../services/answerKeyParser');
const logger = require('../utils/logger');

/**
 * Đọc mọi câu của một mã đề thành mảng phẳng kèm vị trí trong màn — cần vị trí
 * để ghi ngược đáp án vào đúng sub-document.
 */
async function loadQuestionsBySource(source) {
    const sets = await ToeicQuestionSet.find({ source }).select('part questions source').lean();
    const flat = [];
    for (const set of sets) {
        (set.questions || []).forEach((q, idx) => {
            flat.push({
                setId: String(set._id),
                index: idx,
                part: set.part,
                number: q.number,
                correctAnswer: q.correctAnswer,
            });
        });
    }
    return flat;
}

/**
 * So bộ đáp án với đáp án đang lưu trong câu hỏi.
 * Trả 4 nhóm để admin biết chính xác chuyện gì đang xảy ra, thay vì chỉ "có
 * X câu lệch": khớp / lệch / đề chưa có câu đó / câu có mà bộ đáp án chưa phủ.
 */
function compareAnswers(answerMap, questions) {
    const byNumber = new Map(questions.map(q => [Number(q.number), q]));
    const matched = [];
    const mismatched = [];
    const notInTest = [];

    for (const [numStr, ans] of Object.entries(answerMap)) {
        const num = Number(numStr);
        const q = byNumber.get(num);
        if (!q) { notInTest.push({ number: num, answer: ans }); continue; }
        const row = {
            number: num, part: q.part, setId: q.setId, index: q.index,
            current: q.correctAnswer || null, expected: ans,
        };
        if (q.correctAnswer === ans) matched.push(row);
        else mismatched.push(row);
    }

    const covered = new Set(Object.keys(answerMap).map(Number));
    const notInKey = questions
        .filter(q => !covered.has(Number(q.number)))
        .map(q => ({ number: q.number, part: q.part, current: q.correctAnswer || null }));

    return { matched, mismatched, notInTest, notInKey };
}

/**
 * Đọc mã đề + dải câu từ body, báo lỗi rõ ràng nếu sai.
 * @returns {{ error?: string, source: string, rangeText: string, range: object|null }}
 */
function readTarget(body) {
    const source = String(body.source || '').trim();
    const rangeText = String(body.range || '').trim();
    if (!source) return { error: 'Thiếu mã đề', source, rangeText, range: null };
    const range = parseRange(rangeText);
    if (rangeText && !range) {
        return {
            error: `Khoảng số câu "${rangeText}" không hợp lệ — nhập dạng 1-100 (trong phạm vi 1..200)`,
            source, rangeText, range: null,
        };
    }
    return { source, rangeText, range };
}

/**
 * Gộp đáp án mới vào bộ đáp án của mã đề rồi đối chiếu với ngân hàng câu hỏi.
 * Nhập từng phần (1-100 rồi 101-200) phải CỘNG DỒN, không được xoá phần trước.
 */
async function mergeAndCompare({ source, rangeText, answers, userId }) {
    const doc = await ToeicAnswerKey.findOne({ source })
        || new ToeicAnswerKey({ source, answers: new Map() });
    for (const [num, ans] of Object.entries(answers)) doc.answers.set(String(num), ans);
    if (rangeText && !doc.scannedRanges.includes(rangeText)) doc.scannedRanges.push(rangeText);
    doc.updatedBy = userId;
    await doc.save();

    const questions = await loadQuestionsBySource(source);
    return {
        totalInKey: doc.answers.size,
        questionsInTest: questions.length,
        comparison: compareAnswers(Object.fromEntries(doc.answers), questions),
    };
}

/**
 * @desc    Nhập bộ đáp án dạng JSON/text dán tay — đường DUY NHẤT để nạp đáp án.
 *          Server không gọi AI: muốn đọc ảnh thì admin tự dán ảnh vào chat AI
 *          kèm prompt có sẵn ở tab admin rồi dán JSON về đây.
 * @route   POST /api/toeic/answer-keys/import
 * @access  Private/Admin
 * @body    { source, range?, answers }  — answers: object/mảng/chuỗi JSON/text
 */
exports.importAnswerKey = async (req, res, next) => {
    try {
        const { error, source, rangeText, range } = readTarget(req.body);
        if (error) return res.status(400).json({ success: false, message: error });

        // parseAnswerText ném lỗi kèm statusCode 400 khi dán sai định dạng.
        const { answers, skipped, format } = parseAnswerText(req.body.answers, range);
        const merged = await mergeAndCompare({ source, rangeText, answers, userId: req.user.id });

        const count = Object.keys(answers).length;
        const numbers = Object.keys(answers).map(Number);
        logger.info('Nhập bộ đáp án dạng JSON', { source, count, format, by: String(req.user.id) });

        res.json({
            success: true,
            message: `Đã nhập ${count} đáp án (câu ${Math.min(...numbers)}–${Math.max(...numbers)}), không tốn token AI`,
            data: {
                source,
                scannedNow: count,
                format,
                skipped,
                ...merged,
            },
        });
    } catch (error) {
        logger.error('Nhập bộ đáp án lỗi', { error: error.message });
        next(error);
    }
};

/**
 * @desc    Đối chiếu bộ đáp án đã lưu với câu hỏi hiện có (không cần ảnh)
 * @route   GET /api/toeic/answer-keys/:source/compare
 * @access  Private/Admin
 */
exports.compareAnswerKey = async (req, res, next) => {
    try {
        const source = String(req.params.source || '').trim();
        const doc = await ToeicAnswerKey.findOne({ source }).lean();
        if (!doc) {
            return res.status(404).json({ success: false, message: `Chưa có bộ đáp án cho mã đề "${source}"` });
        }
        const questions = await loadQuestionsBySource(source);
        const comparison = compareAnswers(doc.answers || {}, questions);
        res.json({
            success: true,
            data: {
                source,
                totalInKey: Object.keys(doc.answers || {}).length,
                questionsInTest: questions.length,
                scannedRanges: doc.scannedRanges || [],
                comparison,
            },
        });
    } catch (error) { next(error); }
};

/**
 * @desc    Áp đáp án từ bộ đáp án vào câu hỏi (tất cả hoặc chỉ vài câu)
 * @route   POST /api/toeic/answer-keys/:source/apply
 * @access  Private/Admin
 * @body    { numbers?: number[] }  — bỏ trống = áp mọi câu đang lệch
 */
exports.applyAnswerKey = async (req, res, next) => {
    try {
        const source = String(req.params.source || '').trim();
        const doc = await ToeicAnswerKey.findOne({ source }).lean();
        if (!doc) {
            return res.status(404).json({ success: false, message: `Chưa có bộ đáp án cho mã đề "${source}"` });
        }

        const questions = await loadQuestionsBySource(source);
        const { mismatched } = compareAnswers(doc.answers || {}, questions);

        // Chỉ áp những câu ĐANG LỆCH: câu đã khớp thì ghi lại cũng vô nghĩa mà
        // còn làm số liệu "đã sửa" phồng lên không đúng.
        const wanted = Array.isArray(req.body.numbers) && req.body.numbers.length
            ? new Set(req.body.numbers.map(Number))
            : null;
        const targets = wanted ? mismatched.filter(m => wanted.has(m.number)) : mismatched;

        if (!targets.length) {
            return res.json({ success: true, message: 'Không có câu nào cần sửa', data: { updated: 0 } });
        }

        const ops = targets.map(t => ({
            updateOne: {
                filter: { _id: t.setId },
                update: { $set: { [`questions.${t.index}.correctAnswer`]: t.expected } },
            },
        }));
        const result = await ToeicQuestionSet.bulkWrite(ops);

        logger.info('Áp bộ đáp án vào câu hỏi', {
            source, updated: result.modifiedCount, by: String(req.user.id),
        });

        res.json({
            success: true,
            message: `Đã sửa ${result.modifiedCount} câu theo bộ đáp án`,
            data: {
                updated: result.modifiedCount,
                changed: targets.map(t => ({ number: t.number, from: t.current, to: t.expected })),
            },
        });
    } catch (error) { next(error); }
};

/**
 * @desc    Danh sách mã đề đã có bộ đáp án
 * @route   GET /api/toeic/answer-keys
 * @access  Private/Admin
 */
exports.listAnswerKeys = async (req, res, next) => {
    try {
        const docs = await ToeicAnswerKey.find().select('source scannedRanges updatedAt answers').lean();
        res.json({
            success: true,
            data: docs.map(d => ({
                source: d.source,
                count: Object.keys(d.answers || {}).length,
                scannedRanges: d.scannedRanges || [],
                updatedAt: d.updatedAt,
            })).sort((a, b) => a.source.localeCompare(b.source)),
        });
    } catch (error) { next(error); }
};

/**
 * @desc    Xoá bộ đáp án của một mã đề
 * @route   DELETE /api/toeic/answer-keys/:source
 * @access  Private/Admin
 */
exports.deleteAnswerKey = async (req, res, next) => {
    try {
        const r = await ToeicAnswerKey.deleteOne({ source: String(req.params.source || '').trim() });
        if (!r.deletedCount) return res.status(404).json({ success: false, message: 'Không tìm thấy bộ đáp án' });
        res.json({ success: true, message: 'Đã xoá bộ đáp án' });
    } catch (error) { next(error); }
};

module.exports.compareAnswers = compareAnswers; // export để test
