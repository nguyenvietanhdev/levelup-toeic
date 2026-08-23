const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');
const { layPhienAmCau, coChuHan } = require('../services/sentencePhonetic');
const logger = require('../utils/logger');

/**
 * Phiên âm câu ví dụ — IPA cho tiếng Anh, pinyin cho tiếng Trung.
 *
 * Cache ghi thẳng vào bản ghi từ vựng: câu ví dụ là dữ liệu TĨNH, nên phiên âm
 * của nó vĩnh viễn đúng. Người thứ hai gặp cùng câu không phải trả tiền lần
 * nữa, và restart server không mất cache.
 */

/** Bản ghi chứa câu này, ở kho tương ứng ngôn ngữ. */
function khoTheoCau(cau) {
    return coChuHan(cau) ? VocabularyZh : Vocabulary;
}

/**
 * @desc    Lấy phiên âm của một câu ví dụ
 * @route   GET /api/phonetic/sentence?text=...
 */
exports.sentence = async (req, res, next) => {
    try {
        const text = String(req.query.text || '').trim();
        if (!text) {
            return res.status(400).json({ success: false, message: 'Thiếu câu' });
        }

        const Kho = khoTheoCau(text);

        // Đã có trong kho → trả ngay, không gọi AI.
        const daCo = await Kho.findOne({ example: text })
            .select('examplePhonetic').lean();
        if (daCo?.examplePhonetic) {
            return res.json({
                success: true,
                data: { phonetic: daCo.examplePhonetic, cached: true },
            });
        }

        const ai = await layPhienAmCau({ cau: text, userId: req.user?.id || null });
        if (!ai.success) {
            // 200 với `phonetic: ''` chứ KHÔNG phải lỗi: đây là thông tin phụ
            // trợ, client chỉ cần biết "không có" để ẩn dòng đó đi. Trả 5xx là
            // đẩy một lỗi đỏ lên console cho thứ không ảnh hưởng bài học.
            logger.warn('Sentence phonetic failed:', ai.error);
            return res.json({ success: true, data: { phonetic: '' } });
        }

        // Ghi cache cho MỌI bản ghi dùng chung câu này — cùng một câu ví dụ có
        // thể gắn với nhiều từ.
        Kho.updateMany({ example: text }, { $set: { examplePhonetic: ai.phonetic } })
            .catch((e) => logger.warn('Cache phiên âm thất bại:', e.message));

        res.json({ success: true, data: { phonetic: ai.phonetic, cached: false } });
    } catch (error) {
        next(error);
    }
};
