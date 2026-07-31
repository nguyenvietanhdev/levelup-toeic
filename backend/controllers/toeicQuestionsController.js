// ===================================
// TOEIC QUESTIONS CONTROLLER
// ===================================
// Split out of toeicController (P4). Self-contained question-bank CRUD +
// AI generation. LETTERS and the aiQuestionGenerator require are local to
// their handlers. Verbatim move; behaviour unchanged. routes/toeic.js
// imports these from here now.

const ToeicQuestionSet = require('../models/ToeicQuestionSet');
const ToeicPrompt = require('../models/ToeicPrompt');
const logger = require('../utils/logger');

// Số câu MỞ ĐẦU của từng Part theo chuẩn TOEIC — trùng với partRanges dùng lúc
// dựng bài thi. Trước đây câu hỏi đánh số 1,2,3… trong TỪNG Part nên Part 6 ra
// 1–16 thay vì 131–146, lệch hẳn với số ghi trong ảnh đề scan.
const PART_START = { 1: 1, 2: 7, 3: 32, 4: 71, 5: 101, 6: 131, 7: 147 };
// Mốc KẾT THÚC — thiếu nó thì Part đầy sẽ tràn sang dải của Part sau
// (vd Part 5 đủ 30 câu 101-130, câu thứ 31 nhảy lên 131 = dải Part 6).
const PART_END = { 1: 6, 2: 31, 3: 70, 4: 100, 5: 130, 6: 146, 7: 200 };

/**
 * Số câu kế tiếp — đánh theo TỪNG BỘ ĐỀ (source), không phải toàn ngân hàng.
 * DB chứa nhiều bộ đề (ets26t1…ets26t10); mỗi bộ có số riêng theo chuẩn TOEIC
 * (P1 1–6, P2 7–31, P6 131–146…). Không lọc theo source thì bộ thứ hai sẽ nối
 * tiếp bộ thứ nhất (Part 1 ra 7,8,9… thay vì 1,2,3…).
 */
async function nextQuestionNumber(part, source) {
    const start = PART_START[part] || 1;
    const filter = { part };
    if (source) filter.source = source;
    const sets = await ToeicQuestionSet.find(filter).select('questions.number').lean();
    let max = 0;
    for (const set of sets) for (const q of (set.questions || [])) {
        if (Number.isFinite(q.number) && q.number > max) max = q.number;
    }
    const next = Math.max(start, max + 1);
    // Vượt dải của Part → bộ đề này đã đủ câu cho Part đó.
    return next > (PART_END[part] || 200) ? null : next;
}

/**
 * Kiểm tra trùng lặp trước khi tạo màn mới. Trả về CHUỖI LỖI nếu là bản trùng
 * (mọi số câu định tạo đều đã tồn tại trong cùng source + part), null nếu ok.
 * Chỉ chặn khi TRÙNG HOÀN TOÀN — trùng một phần có thể là chỉnh sửa hợp lệ.
 */
async function rejectIfDuplicate(payload) {
    const nums = (payload.questions || []).map(q => q.number).filter(Number.isFinite);
    if (!nums.length) return null;

    const filter = { part: payload.part };
    if (payload.source) filter.source = payload.source;
    const existing = await ToeicQuestionSet.find(filter).select('questions.number').lean();

    const taken = new Set();
    for (const s of existing) for (const q of (s.questions || [])) {
        if (Number.isFinite(q.number)) taken.add(q.number);
    }
    const allExist = nums.every(n => taken.has(n));
    if (allExist) {
        const label = nums.length === 1 ? `câu ${nums[0]}` : `các câu ${Math.min(...nums)}–${Math.max(...nums)}`;
        return `Bộ đề "${payload.source || '(không có)'}" đã có ${label} (Part ${payload.part}). `
            + 'Bỏ qua để tránh trùng — xoá màn cũ nếu muốn nhập lại.';
    }
    return null;
}

/**
 * Chuẩn hoá payload admin thành MỘT MÀN.
 * Nhận cả hai dạng để giao diện cũ chạy tiếp:
 *   • dạng NHÓM: { questions: [ {...}, ... ] }
 *   • dạng CÂU ĐƠN (phẳng): { questionText, options, correctAnswer, ... }
 * Part 1/2/5 chỉ là màn có đúng 1 câu — không có nhánh riêng theo part.
 */
/** Đếm SỐ CÂU (không phải số màn) khớp một điều kiện. */
async function countQuestionsIn(filter) {
    const rows = await ToeicQuestionSet.aggregate([
        { $match: filter },
        { $group: { _id: null, n: { $sum: { $size: '$questions' } } } },
    ]);
    return rows[0]?.n || 0;
}

function buildSetPayload(body) {
    const part = parseInt(body.part);
    const raw = (Array.isArray(body.questions) && body.questions.length)
        ? body.questions
        : [{
            number: body.questionNumber,
            questionText: body.questionText,
            questionTranslate: body.questionTranslate,
            options: body.options,
            correctAnswer: body.correctAnswer,
            explanation: body.explanation,
        }];

    const questions = raw.map((q, i) => {
        const options = (Array.isArray(q.options) ? q.options : [])
            .map((o, idx) => ({ label: o.label || String.fromCharCode(65 + idx), text: String(o.text ?? '').trim() }))
            .filter(o => o.text);
        if (options.length < 3) throw Object.assign(new Error(`Câu #${i + 1}: cần tối thiểu 3 đáp án.`), { status: 400 });
        if (!q.correctAnswer || !options.some(o => o.label === q.correctAnswer)) {
            throw Object.assign(new Error(`Câu #${i + 1}: correctAnswer không khớp đáp án nào.`), { status: 400 });
        }
        return {
            number: Number.isFinite(Number(q.number)) ? Number(q.number) : undefined,
            questionText: q.questionText ? String(q.questionText).trim() : undefined,
            questionTranslate: q.questionTranslate ? String(q.questionTranslate).trim() : undefined,
            options,
            correctAnswer: q.correctAnswer,
            explanation: (q.explanation && typeof q.explanation === 'object') ? q.explanation
                : (q.explanation ? { note: String(q.explanation).trim() } : {}),
        };
    });

    return {
        part,
        source: body.source ? String(body.source).trim() : undefined,
        audioUrl: body.audioUrl ? String(body.audioUrl).trim() : undefined,
        audioText: body.audioText ? String(body.audioText).trim() : undefined,
        audioTranslate: body.audioTranslate ? String(body.audioTranslate).trim() : undefined,
        imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.filter(Boolean) : [],
        passages: Array.isArray(body.passages) ? body.passages.filter(Boolean) : [],
        passageCount: body.passageCount ? parseInt(body.passageCount) : undefined,
        questions,
    };
}

/**
 * @desc    Get all TOEIC questions (Admin)
 * @route   GET /api/toeic/questions
 * @access  Private/Admin
 */
// Thứ tự sắp xếp cho bảng câu hỏi admin. Mặc định 'newest' — thêm màn xong
// phải thấy nó ngay đầu bảng; sắp theo `source` như trước khiến màn mới của đề
// có mã đứng cuối bảng chữ cái bị đẩy ra tận cuối danh sách.
const QUESTION_SORTS = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    'part-asc': { part: 1, 'questions.0.number': 1 },
    'part-desc': { part: -1, 'questions.0.number': 1 },
    'most-used': { 'questions.0.timesUsed': -1 },
    'least-used': { 'questions.0.timesUsed': 1 },
    source: { source: 1, part: 1, 'questions.0.number': 1 },
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getQuestions = async (req, res, next) => {
    try {
        const { part, topic, source, search, sort = 'newest', page = 1, limit = 20 } = req.query;
        const query = {};
        if (part) query.part = parseInt(part);
        if (topic) query.topic = topic;
        if (source) query.source = source;

        // Tìm theo nội dung — LỌC Ở SERVER để quét toàn bộ kho, không phải chỉ
        // phần đã tải về trang hiện tại.
        if (search && String(search).trim()) {
            const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
            query.$or = [
                { 'questions.questionText': rx },
                { 'questions.options.text': rx },
                { passages: rx },
                { audioText: rx },
                // explanation là Mixed ({A,B,C,D} hoặc {note}) nên phải liệt kê
                // từng khoá — regex không tự quét hết field của một object.
                // Ô tìm ghi rõ "…, explanation" nên thiếu chỗ này là sai lời hứa.
                ...['A', 'B', 'C', 'D', 'note'].map(k => ({ [`questions.explanation.${k}`]: rx })),
            ];
        }

        const perPage = Math.min(200, Math.max(1, parseInt(limit) || 20));
        const curPage = Math.max(1, parseInt(page) || 1);
        const skip = (curPage - 1) * perPage;

        // Một dòng = một MÀN (Part 1/2/5 là màn 1 câu).
        const [sets, total] = await Promise.all([
            ToeicQuestionSet.find(query)
                .sort(QUESTION_SORTS[sort] || QUESTION_SORTS.newest)
                .limit(perPage).skip(skip).lean(),
            ToeicQuestionSet.countDocuments(query),
        ]);

        res.json({
            success: true,
            count: sets.length,
            total,
            page: curPage,
            limit: perPage,
            pages: Math.ceil(total / perPage),
            data: sets,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get single question
 * @route   GET /api/toeic/questions/:id
 * @access  Private/Admin
 */
exports.getQuestion = async (req, res, next) => {
    try {
        const set = await ToeicQuestionSet.findById(req.params.id).lean();
        if (!set) return res.status(404).json({ success: false, message: 'Không tìm thấy màn hỏi' });
        res.json({ success: true, data: set });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create new question (Admin)
 * @route   POST /api/toeic/questions
 * @access  Private/Admin
 */
exports.createQuestion = async (req, res, next) => {
    try {
        const payload = buildSetPayload(req.body);
        // Câu nào chưa có số → đánh tiếp theo chuẩn TOEIC của Part trong bộ đề đó.
        let next = await nextQuestionNumber(payload.part, payload.source);
        for (const q of payload.questions) {
            if (Number.isFinite(q.number)) continue;
            if (next === null || next > (PART_END[payload.part] || 200)) {
                return res.status(400).json({
                    success: false,
                    message: `Part ${payload.part} của bộ đề "${payload.source || '(không có)'}" đã đủ câu `
                        + `(${PART_START[payload.part]}–${PART_END[payload.part]}). `
                        + 'Hãy nhập "Số câu" thủ công nếu muốn ghi đè, hoặc dùng bộ đề khác.',
                });
            }
            q.number = next++;
        }

        // Chặn IMPORT TRÙNG: nếu MỌI số câu định tạo đã có sẵn trong cùng bộ đề +
        // Part → đây là lần import lặp lại, từ chối để khỏi đẻ màn trùng.
        const dupErr = await rejectIfDuplicate(payload);
        if (dupErr) return res.status(409).json({ success: false, message: dupErr });

        const set = await ToeicQuestionSet.create({ ...payload, createdBy: req.user.id });
        res.status(201).json({
            success: true,
            message: `✅ Đã tạo màn ${set.questions.length} câu (Part ${set.part}).`,
            data: set,
        });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
        next(error);
    }
};

/**
 * @desc    Tạo cả một NHÓM câu hỏi cùng lúc (Part 3/4/6/7): 1 ngữ cảnh, nhiều câu.
 *          Tự sinh groupId, tự đánh questionIndex 1..N, media chung gắn ở câu ĐẦU.
 * @route   POST /api/toeic/questions/group
 * @access  Private/Admin
 */
exports.createQuestionGroup = async (req, res, next) => {
    // Nhóm câu hỏi CHÍNH LÀ một màn nhiều câu → dùng chung đường tạo màn.
    // Giữ endpoint riêng để giao diện trình dựng nhóm không phải đổi.
    const p = parseInt(req.body?.part);
    if (![3, 4, 6, 7].includes(p)) {
        return res.status(400).json({ success: false, message: 'Nhóm câu hỏi chỉ dùng cho Part 3/4/6/7.' });
    }
    if (!Array.isArray(req.body?.questions) || req.body.questions.length < 2) {
        return res.status(400).json({ success: false, message: 'Nhóm cần ít nhất 2 câu hỏi.' });
    }
    if (!req.body?.source || !String(req.body.source).trim()) {
        return res.status(400).json({ success: false, message: 'Thiếu "source" (mã đề) cho nhóm.' });
    }
    return exports.createQuestion(req, res, next);
};

/**
 * @desc    Update question (Admin)
 * @route   PUT /api/toeic/questions/:id
 * @access  Private/Admin
 */
exports.updateQuestion = async (req, res, next) => {
    try {
        const payload = buildSetPayload(req.body);
        const current = await ToeicQuestionSet.findById(req.params.id).select('questions.number').lean();
        if (!current) return res.status(404).json({ success: false, message: 'Không tìm thấy màn hỏi' });

        // Thiếu số thì giữ số cũ theo vị trí, không đánh lại từ đầu.
        payload.questions.forEach((q, i) => {
            if (!Number.isFinite(q.number)) q.number = current.questions[i]?.number;
        });
        let next = await nextQuestionNumber(payload.part, payload.source);
        payload.questions.forEach(q => { if (!Number.isFinite(q.number)) q.number = next++; });

        const set = await ToeicQuestionSet.findByIdAndUpdate(req.params.id, payload,
            { new: true, runValidators: true });
        res.json({ success: true, message: 'Đã cập nhật màn hỏi', data: set });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
        next(error);
    }
};

/**
 * @desc    Delete question (Admin)
 * @route   DELETE /api/toeic/questions/:id
 * @access  Private/Admin
 */
exports.deleteQuestion = async (req, res, next) => {
    try {
        const set = await ToeicQuestionSet.findByIdAndDelete(req.params.id);
        if (!set) return res.status(404).json({ success: false, message: 'Không tìm thấy màn hỏi' });
        res.json({ success: true, message: `Đã xoá màn (${set.questions.length} câu)` });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete all questions (Admin)
 * @route   DELETE /api/toeic/questions/delete-all
 * @access  Private/Admin
 */
exports.deleteAllQuestions = async (req, res, next) => {
    try {
        const result = await ToeicQuestionSet.deleteMany({});
        res.json({
            success: true,
            message: 'Đã xoá toàn bộ câu hỏi TOEIC',
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        next(error);
    }
};

// Ảnh bắt buộc / tối đa theo Part — khớp IMAGE_RULES bên admin.
const IMAGE_RULES = { 1: [1, 1], 3: [0, 1], 4: [0, 1], 6: [1, 1], 7: [1, 3] };

/**
 * @desc    Soi ngân hàng câu hỏi tìm chỗ hỏng. KHÔNG sửa gì, chỉ báo cáo.
 * @route   GET /api/toeic/questions/health
 * @access  Private/Admin
 *
 * Ngân hàng câu hỏi không có số liệu nào bị "lệch" như đề thi, nhưng có ba thứ
 * âm thầm hỏng mà nhìn bảng không ra: số câu TRÙNG trong cùng bộ đề (làm bài
 * sẽ thấy hai câu 143), số câu LỌT ngoài dải chuẩn của Part, và màn THIẾU
 * media bắt buộc (Part 6/7 không ảnh thì người làm bài không có gì để đọc).
 */
exports.checkQuestionsHealth = async (req, res, next) => {
    try {
        const sets = await ToeicQuestionSet.find({})
            .select('part source audioUrl imageUrls questions.number')
            .lean();

        const duplicates = [];
        const outOfRange = [];
        const missingMedia = [];
        const seen = new Map(); // "source|part|number" → số lần gặp

        let totalQuestions = 0;

        for (const s of sets) {
            const lo = PART_START[s.part];
            const hi = PART_END[s.part];
            const src = s.source || '(không có source)';

            for (const q of s.questions || []) {
                totalQuestions++;
                const n = Number(q.number);
                if (!Number.isFinite(n)) {
                    outOfRange.push({ setId: String(s._id), source: src, part: s.part, number: '(trống)' });
                    continue;
                }
                if (n < lo || n > hi) {
                    outOfRange.push({ setId: String(s._id), source: src, part: s.part, number: n, dai: `${lo}-${hi}` });
                }
                const key = `${src}|${s.part}|${n}`;
                seen.set(key, (seen.get(key) || 0) + 1);
            }

            // Media bắt buộc
            const [minImg] = IMAGE_RULES[s.part] || [0, 0];
            const imgs = (s.imageUrls || []).filter(Boolean).length;
            if (imgs < minImg) {
                missingMedia.push({ setId: String(s._id), source: src, part: s.part, thieu: `ảnh (có ${imgs}/${minImg})` });
            }
            if (s.part >= 1 && s.part <= 4 && !s.audioUrl) {
                missingMedia.push({ setId: String(s._id), source: src, part: s.part, thieu: 'audio' });
            }
        }

        for (const [key, count] of seen) {
            if (count < 2) continue;
            const [source, part, number] = key.split('|');
            duplicates.push({ source, part: Number(part), number: Number(number), soLan: count });
        }

        const issues = duplicates.length + outOfRange.length + missingMedia.length;
        res.json({
            success: true,
            message: issues
                ? `Đã soi ${sets.length} màn (${totalQuestions} câu) — thấy ${issues} chỗ cần xem lại`
                : `Đã soi ${sets.length} màn (${totalQuestions} câu) — không thấy vấn đề gì`,
            sets: sets.length,
            totalQuestions,
            issues,
            duplicates,
            outOfRange,
            missingMedia,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Lấy TẤT CẢ prompt admin đã sửa (chỉ những cái có ghi đè).
 * @route   GET /api/toeic/prompts
 * @access  Private/Admin
 */
exports.getPrompts = async (req, res, next) => {
    try {
        const rows = await ToeicPrompt.find({}).select('key content updatedAt').lean();
        // Trả dạng { key: content } cho frontend gộp thẳng vào bản mặc định.
        const data = {};
        rows.forEach(r => { data[r.key] = r.content; });
        res.json({ success: true, data, updatedAt: Object.fromEntries(rows.map(r => [r.key, r.updatedAt])) });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Ghi đè prompt của một Part (hoặc 'all').
 * @route   PUT /api/toeic/prompts/:key
 * @access  Private/Admin
 */
exports.savePrompt = async (req, res, next) => {
    try {
        const { key } = req.params;
        const content = String(req.body?.content ?? '').trim();
        if (!content) {
            return res.status(400).json({ success: false, message: 'Nội dung prompt không được để trống.' });
        }
        const doc = await ToeicPrompt.findOneAndUpdate(
            { key },
            { content, updatedBy: req.user.id },
            { new: true, upsert: true, runValidators: true }
        );
        res.json({ success: true, message: `Đã lưu prompt "${key}"`, data: { key: doc.key, updatedAt: doc.updatedAt } });
    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: 'Key prompt không hợp lệ (1-7 hoặc "all").' });
        }
        next(error);
    }
};

/**
 * @desc    Khôi phục mặc định = XOÁ bản ghi đè (bản gốc vẫn nằm trong code).
 * @route   DELETE /api/toeic/prompts/:key
 * @access  Private/Admin
 */
exports.resetPrompt = async (req, res, next) => {
    try {
        const r = await ToeicPrompt.deleteOne({ key: req.params.key });
        res.json({
            success: true,
            message: r.deletedCount ? 'Đã khôi phục prompt mặc định' : 'Prompt này vốn đang dùng mặc định',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Danh sách các nguồn (source) đang có — để form tạo đề chọn thay vì gõ tay.
 * @route   GET /api/toeic/questions/sources
 * @access  Private/Admin
 */
exports.getQuestionSources = async (req, res, next) => {
    try {
        // distinct đã bỏ trùng; lọc rỗng/null rồi sắp xếp cho dễ nhìn.
        const sources = (await ToeicQuestionSet.distinct('source'))
            .filter(s => s && s.trim())
            .sort((a, b) => a.localeCompare(b));
        res.json({ success: true, data: sources });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get questions statistics by part (Admin)
 * @route   GET /api/toeic/questions/statistics
 * @access  Private/Admin
 */
exports.getQuestionsStatistics = async (req, res, next) => {
    try {
        const partNames = {
            1: 'Photographs',
            2: 'Question-Response',
            3: 'Conversations',
            4: 'Talks',
            5: 'Incomplete Sentences',
            6: 'Text Completion',
            7: 'Reading Comprehension'
        };

        const partRequirements = {
            1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54
        };

        const statistics = [];
        let totalAvailable = 0;
        let totalRequired = 0;
        let canCreateFullTest = true;

        for (let part = 1; part <= 7; part++) {
            const total = await countQuestionsIn({ part, isActive: true, isPublished: true });

            const required = partRequirements[part];
            const missing = Math.max(0, required - total);
            const canCreate = total >= required;

            if (!canCreate) canCreateFullTest = false;

            totalAvailable += total;
            totalRequired += required;

            statistics.push({
                part,
                partName: partNames[part],
                available: total,
                required,
                missing,
                canCreate
            });
        }

        // Section breakdown
        const listeningCount = await countQuestionsIn({
            part: { $in: [1, 2, 3, 4] },
            isActive: true,
            isPublished: true,
        });

        const readingCount = await countQuestionsIn({
            part: { $in: [5, 6, 7] },
            isActive: true,
            isPublished: true,
        });

        res.json({
            success: true,
            data: {
                parts: statistics,
                summary: {
                    totalAvailable,
                    totalRequired,
                    missing: totalRequired - totalAvailable,
                    progress: ((totalAvailable / totalRequired) * 100).toFixed(1),
                    canCreateFullTest
                },
                sections: {
                    listening: {
                        count: listeningCount,
                        required: 100
                    },
                    reading: {
                        count: readingCount,
                        required: 100
                    }
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Generate questions using AI (Admin)
 * @route   POST /api/toeic/questions/ai-generate
 * @access  Private/Admin
 */
exports.generateQuestionsWithAI = async (req, res, next) => {
    try {
        const { part, count = 5, autoSave = false } = req.body;

        // Validate part
        if (!part || part < 1 || part > 7) {
            return res.status(400).json({
                success: false,
                message: 'Invalid part number. Must be between 1 and 7.',
            });
        }

        // Validate count
        if (count < 1 || count > 50) {
            return res.status(400).json({
                success: false,
                message: 'Count must be between 1 and 50.',
            });
        }

        logger.debug(`AI generating ${count} questions for Part ${part}`);

        const aiGenerator = require('../services/aiQuestionGenerator');
        const generatedQuestions = await aiGenerator.generateQuestions(part, count);

        // Optionally save to database
        let savedQuestions = [];
        if (autoSave) {
            for (let i = 0; i < generatedQuestions.length; i++) {
                const qData = generatedQuestions[i];

                const LETTERS = ['A', 'B', 'C', 'D'];
                const transformedOptions = qData.options.map((opt, idx) => ({
                    label: LETTERS[idx] || LETTERS[0],
                    text: opt.optionText,
                    isCorrect: opt.isCorrect,
                }));

                const correctIdx = qData.options.findIndex(opt => opt.isCorrect);
                const correctAnswer = LETTERS[correctIdx >= 0 ? correctIdx : 0];

                // AI sinh từng câu rời → mỗi câu là một MÀN 1 câu.
                const setToSave = {
                    part: qData.part,
                    audioText: qData.audioTranscript || undefined,
                    passages: qData.passage ? [qData.passage] : [],
                    topic: qData.passageType || 'general',
                    tags: ['ai-generated'],
                    isPublished: false,
                    isActive: true,
                    createdBy: req.user.id,
                    questions: [{
                        number: await nextQuestionNumber(qData.part, undefined),
                        questionText: qData.questionText,
                        options: transformedOptions,
                        correctAnswer,
                        explanation: qData.explanation || {},
                    }],
                };

                const savedQuestion = await ToeicQuestionSet.create(setToSave);
                savedQuestions.push(savedQuestion);
            }

            logger.debug(`✅ Saved ${savedQuestions.length} AI-generated questions to database`);
        }

        res.status(201).json({
            success: true,
            message: autoSave
                ? `Generated and saved ${generatedQuestions.length} questions successfully`
                : `Generated ${generatedQuestions.length} questions successfully (not saved)`,
            data: autoSave ? savedQuestions : generatedQuestions,
            metadata: {
                part,
                count: generatedQuestions.length,
                autoSaved: autoSave,
                needsReview: autoSave,
            },
        });

    } catch (error) {
        logger.error('AI generation error:', error);
        next(error);
    }
};

module.exports = exports;
