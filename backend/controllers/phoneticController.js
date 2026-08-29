const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');
const VocabularyBi = require('../models/VocabularyBi');
const { layPhienAmCau, coChuHan } = require('../services/sentencePhonetic');
const logger = require('../utils/logger');

/**
 * Phiên âm câu ví dụ — IPA cho tiếng Anh, pinyin cho tiếng Trung.
 *
 * Cache ghi thẳng vào bản ghi từ vựng: câu ví dụ là dữ liệu TĨNH, nên phiên âm
 * của nó vĩnh viễn đúng. Người thứ hai gặp cùng câu không phải trả tiền lần
 * nữa, và restart server không mất cache.
 */

/**
 * Nơi tra và ghi cache phiên âm của một câu.
 *
 * Trả về DANH SÁCH chứ không một kho: cùng một câu tiếng Anh có thể nằm ở kho
 * tiếng Anh (`example`) lẫn kho song ngữ (`exampleEn`), và kho song ngữ dùng
 * tên trường khác hẳn vì mỗi bản ghi ôm cả hai ngôn ngữ.
 *
 * Bỏ sót kho song ngữ là hỏng đúng hai đường một lúc: tra cache không bao giờ
 * trúng, mà ghi cache cũng không trúng bản ghi nào — nên mỗi lần hiện thẻ song
 * ngữ là một lần gọi AI tính tiền, lặp lại vô hạn.
 */
function khoTheoCau(cau) {
    const zh = coChuHan(cau);
    const KhoCu = zh ? VocabularyZh : Vocabulary;
    const hau = zh ? 'Zh' : 'En';

    // Cả câu ví dụ LẪN chuỗi đồng nghĩa: client chỉ gửi đoạn chữ, không nói đó
    // là loại nào — mà cùng một endpoint phục vụ cả hai. Thiếu vế đồng nghĩa
    // thì nó không nằm ở ô nào, nên lần nào hiện thẻ cũng gọi AI lại.
    return [
        { Kho: KhoCu, oCau: 'example', oPhienAm: 'examplePhonetic' },
        { Kho: KhoCu, oCau: 'synonyms', oPhienAm: 'synonymsPhonetic' },
        { Kho: VocabularyBi, oCau: `example${hau}`, oPhienAm: `examplePhonetic${hau}` },
        { Kho: VocabularyBi, oCau: `synonyms${hau}`, oPhienAm: `synonymsPhonetic${hau}` },
    ];
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

        const nguon = khoTheoCau(text);

        // Đã có ở BẤT KỲ kho nào → trả ngay, không gọi AI.
        for (const { Kho, oCau, oPhienAm } of nguon) {
            const daCo = await Kho.findOne({ [oCau]: text }).select(oPhienAm).lean();
            if (daCo?.[oPhienAm]) {
                return res.json({
                    success: true,
                    data: { phonetic: daCo[oPhienAm], cached: true },
                });
            }
        }

        const ai = await layPhienAmCau({ cau: text, userId: req.user?.id || null });
        if (!ai.success) {
            // 200 với `phonetic: ''` chứ KHÔNG phải lỗi: đây là thông tin phụ
            // trợ, client chỉ cần biết "không có" để ẩn dòng đó đi. Trả 5xx là
            // đẩy một lỗi đỏ lên console cho thứ không ảnh hưởng bài học.
            logger.warn('Sentence phonetic failed:', ai.error);
            return res.json({ success: true, data: { phonetic: '' } });
        }

        // Ghi cache cho MỌI bản ghi dùng chung câu này, ở mọi kho — cùng một câu
        // ví dụ có thể gắn với nhiều từ, và có mặt ở cả kho song ngữ.
        for (const { Kho, oCau, oPhienAm } of nguon) {
            Kho.updateMany({ [oCau]: text }, { $set: { [oPhienAm]: ai.phonetic } })
                .catch((e) => logger.warn('Cache phiên âm thất bại:', e.message));
        }

        res.json({ success: true, data: { phonetic: ai.phonetic, cached: false } });
    } catch (error) {
        next(error);
    }
};
