const mongoose = require('mongoose');
const WrongWord = require('../models/WrongWord');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const logger = require('../utils/logger');

/**
 * Kho từ vựng người dùng đang học — dùng để lọc từ sai.
 *
 * Ba giá trị, KHÔNG phải hai: `'en'`, `'zh'` và `'bi'` (song ngữ Trung–Anh).
 *
 * Bản cũ viết `=== 'zh' ? 'zh' : 'en'` nên kho song ngữ rơi vào nhánh `'en'`.
 * Mà `WrongWord.langFilter('en')` loại hẳn `lang: 'bi'` ra, nên người học song
 * ngữ KHÔNG BAO GIỜ thấy từ sai của mình: tab "Từ vựng sai" trống trơn và chế
 * độ "Ôn lại từ sai" không có gì để ôn — trong khi từ sai vẫn đang được ghi
 * vào DB bình thường.
 */
function khoDangHoc(profile) {
    const kho = profile?.settings?.vocabLang;
    return kho === 'zh' || kho === 'bi' ? kho : 'en';
}


/** Hạn TTL cho một từ sai mới: now + WrongWord.TTL_DAYS ngày. */
function ttlDate() {
    return new Date(Date.now() + (WrongWord.TTL_DAYS || 30) * 24 * 60 * 60 * 1000);
}

/** Lấy email của user hiện tại (khoá phân biệt người dùng cho từ sai). */
async function resolveUserEmail(userId) {
    try {
        const u = await User.findById(userId).select('email').lean();
        return u?.email || null;
    } catch {
        return null;
    }
}

/**
 * Suy ngôn ngữ của từ khi client không gửi `lang`.
 *
 * Dựa vào chữ Hán trong mặt từ. Kiểm trên 136 từ thật trong DB: KHÔNG source
 * nào trộn hai loại — `hsk1`, `zh_giaotiep_tuvung`, `1000字` toàn chữ Hán;
 * `600words`, `verb_pattern`, `sentence_pattern` toàn Latin — và 0 từ thuộc kho
 * Trung mà thiếu chữ Hán. Nên phép suy này đúng tuyệt đối trên dữ liệu hiện có.
 *
 * Vẫn nhận `lang` từ client khi có: suy đoán chỉ để vá cho client cũ và cho
 * 139 bản ghi có sẵn không mang trường này.
 */
const HAN_RE = /[一-鿿㐀-䶿]/;
function deriveLang(body = {}) {
    if (body.lang === 'zh' || body.lang === 'en') return body.lang;
    return HAN_RE.test(String(body.en || '') + String(body.wordId || '')) ? 'zh' : 'en';
}

/**
 * @desc    Thêm từ sai mới hoặc cập nhật nếu đã tồn tại
 * @route   POST /api/wrong-words
 * @access  Private
 */
exports.addWrongWord = async (req, res) => {
    try {
        const { wordId, en, vn, phonetic, type, level, part, example, image, source } = req.body;
        const userId = req.user.id || req.user._id;

        // ✅ Debug logging
        logger.debug('📝 addWrongWord - Received data:', {
            wordId,
            en,
            vn,
            hasUserId: !!userId
        });

        // ✅ Validate required fields
        if (!wordId) {
            return res.status(400).json({
                success: false,
                message: 'wordId is required'
            });
        }

        if (!en) {
            return res.status(400).json({
                success: false,
                message: 'en is required'
            });
        }

        if (!vn) {
            return res.status(400).json({
                success: false,
                message: 'vn is required'
            });
        }

        // Tìm xem từ này đã tồn tại chưa
        let wrongWord = await WrongWord.findOne({ userId, wordId });

        if (wrongWord) {
            // Nếu đã tồn tại, gọi recordWrong để cập nhật
            if (!wrongWord.userEmail) {
                wrongWord.userEmail = await resolveUserEmail(userId);
            }
            if (!wrongWord.source && source) {
                wrongWord.source = source;
            }
            // Vá dần bản ghi cũ: 139 doc có sẵn không mang `lang`, mỗi lần gặp
            // lại là một cơ hội gắn đúng mà không cần migration riêng.
            if (!wrongWord.lang) {
                wrongWord.lang = deriveLang({ ...req.body, en: wrongWord.en });
            }
            wrongWord.recordWrong();
            await wrongWord.save();

            return res.status(200).json({
                success: true,
                message: 'Đã cập nhật từ sai',
                data: wrongWord
            });
        }

        // Tạo mới
        wrongWord = await WrongWord.create({
            userId,
            userEmail: await resolveUserEmail(userId),
            wordId,
            en,
            vn,
            phonetic,
            type,
            level,
            part,
            source,
            lang: deriveLang(req.body),
            example,
            image,
            expiresAt: ttlDate()
        });

        // Tính priority ban đầu
        wrongWord.calculatePriority();
        await wrongWord.save();

        res.status(201).json({
            success: true,
            message: 'Đã thêm từ sai',
            data: wrongWord
        });
    } catch (error) {
        logger.error('Error in addWrongWord:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi thêm từ sai',
            error: error.message
        });
    }
};

/**
 * @desc    Đánh dấu làm đúng
 * @route   POST /api/wrong-words/:wordId/correct
 * @access  Private
 */
exports.recordCorrect = async (req, res) => {
    try {
        const { wordId } = req.params;
        const userId = req.user.id || req.user._id;

        const wrongWord = await WrongWord.findOne({ userId, wordId });

        if (!wrongWord) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy từ'
            });
        }

        // Gọi recordCorrect
        wrongWord.recordCorrect();

        // Đã thuộc → xoá hẳn khỏi DB (không giữ lại doc 'mastered')
        if (wrongWord.status === 'mastered') {
            await wrongWord.deleteOne();
            return res.status(200).json({
                success: true,
                message: 'Đã thuộc từ này!',
                data: wrongWord, // vẫn còn giá trị in-memory để FE hiện toast
            });
        }

        await wrongWord.save();

        res.status(200).json({
            success: true,
            message: 'Đã cập nhật',
            data: wrongWord
        });
    } catch (error) {
        logger.error('Error in recordCorrect:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật',
            error: error.message
        });
    }
};

/**
 * @desc    Lấy từ ĐẾN HẠN ôn theo lịch SM-2
 * @route   GET /api/wrong-words/review?limit=10[&all=1]
 * @access  Private
 *
 * Trước đây route này lấy MỌI từ active và bỏ qua `nextReviewDate`. Làm vậy thì
 * bốn trường SM-2 (`easinessFactor`/`interval`/`repetition`/`nextReviewDate`)
 * chỉ là số trang trí: từ vừa trả lời đúng xong vẫn hiện lại ngay lượt sau, còn
 * giãn cách — thứ khiến lặp lại ngắt quãng có tác dụng — thì không bao giờ xảy
 * ra. Không có chỗ nào trong frontend/admin gọi route này nên đổi được an toàn.
 *
 * `all=1` bỏ lọc theo hạn, cho người dùng chủ động ôn thêm khi đã hết từ đến hạn.
 *
 * LỌC THEO NGÔN NGỮ đang học. Không lọc thì người học tiếng Trung mở phần ôn ra
 * gặp `due`, `fiscal`, `meticulously` xen giữa 你好 và 别的 — trong DB thật 136
 * từ đến hạn là 98 Trung trộn 38 Anh.
 */
exports.getWordsToReview = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        // Chặn trên 50: đây là một phiên ôn, không phải chỗ kéo cả kho từ về.
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const all = req.query.all === '1' || req.query.all === 'true';

        // Ngôn ngữ lấy từ HỒ SƠ, không nhận từ client (giống Viết luận/Hội thoại).
        const profile = await UserProfile.findOne({ userId }).select('settings').lean();
        const lang = khoDangHoc(profile);

        // Bản ghi CŨ chưa có `lang` (139 doc trong DB) vẫn phải lọc đúng, nếu
        // không thì tính năng vô dụng cho tới khi người dùng gặp lại từng từ.
        // Suy bằng chữ Hán ngay trong truy vấn — đã kiểm trên dữ liệu thật:
        // không source nào trộn hai loại, 0 ngoại lệ.
        const base = { userId, status: 'active', ...WrongWord.langFilter(lang) };
        const filter = { ...base };
        if (!all) filter.nextReviewDate = { $lte: new Date() };

        const words = await WrongWord.find(filter)
            // Quá hạn lâu nhất lên trước, rồi mới đến priority: một từ trễ hai
            // tuần cần ôn gấp hơn từ vừa đến hạn sáng nay dù priority thấp hơn.
            .sort({ nextReviewDate: 1, priorityScore: -1 })
            .limit(limit);

        // Tổng số đến hạn (không phụ thuộc `limit`) — frontend cần con số này cho
        // badge ở menu và để biết còn bao nhiêu sau phiên này.
        // Cũng lọc theo ngôn ngữ: badge báo 136 mà mở ra chỉ có 98 là sai lệch.
        const dueTotal = await WrongWord.countDocuments({
            ...base, nextReviewDate: { $lte: new Date() },
        });

        res.status(200).json({
            success: true,
            count: words.length,
            dueTotal,
            lang,
            data: words
        });
    } catch (error) {
        logger.error('Error in getWordsToReview:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy từ cần ôn',
            error: error.message
        });
    }
};

/**
 * @desc    Lấy tất cả từ sai đang active
 * @route   GET /api/wrong-words?limit=100
 * @access  Private
 */
exports.getAllWrongWords = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        const limit = parseInt(req.query.limit) || 100;

        // Ngôn ngữ lấy từ HỒ SƠ, không nhận từ client — giống `getWordsToReview`.
        // Thiếu bước này thì popup chọn nhóm từ sai hiện lẫn nhóm tiếng Trung
        // với nhóm tiếng Anh, và chọn nhóm nào cũng ra một lượt ôn lẫn lộn.
        const profile = await UserProfile.findOne({ userId }).select('settings').lean();
        const lang = khoDangHoc(profile);

        logger.debug(`📚 getAllWrongWords: Fetching active words for user ${userId}, limit=${limit}, lang=${lang}`);

        const words = await WrongWord.getActiveWords(userId, limit, lang);

        logger.debug(`✅ getAllWrongWords: Found ${words.length} active words`);

        res.status(200).json({
            success: true,
            count: words.length,
            lang,
            data: words
        });
    } catch (error) {
        logger.error('Error in getAllWrongWords:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách từ sai',
            error: error.message
        });
    }
};

/**
 * @desc    Xóa từ
 * @route   DELETE /api/wrong-words/:wordId
 * @access  Private
 */
exports.deleteWrongWord = async (req, res) => {
    try {
        const { wordId } = req.params;
        const userId = req.user.id || req.user._id;

        const wrongWord = await WrongWord.findOneAndDelete({ userId, wordId });

        if (!wrongWord) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy từ'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Đã xóa từ'
        });
    } catch (error) {
        logger.error('Error in deleteWrongWord:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa từ',
            error: error.message
        });
    }
};

/**
 * @desc    Thống kê
 * @route   GET /api/wrong-words/stats
 * @access  Private
 */
exports.getStats = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;

        const stats = await WrongWord.getStats(userId);

        // Đếm số từ cần ôn hôm nay
        const now = new Date();
        const todayCount = await WrongWord.countDocuments({
            userId,
            status: 'active',
            nextReviewDate: { $lte: now }
        });

        res.status(200).json({
            success: true,
            data: {
                stats,
                todayReviewCount: todayCount
            }
        });
    } catch (error) {
        logger.error('Error in getStats:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê',
            error: error.message
        });
    }
};

/**
 * @desc    Đếm từ sai theo NGUỒN và theo PART
 * @route   GET /api/wrong-words/summary
 * @access  Private
 *
 * Để thẻ đề / thẻ Part hiện được "còn bao nhiêu từ phải ôn" ngay lúc chọn —
 * người học nhìn con số đó để quyết định học đề nào, chứ không phải mở từng đề
 * ra đếm.
 *
 * Dùng AGGREGATE chứ không tải danh sách rồi đếm ở client: `getAllWrongWords`
 * có `limit` mặc định 100, nên đếm từ đó thì con số trần ở 100 và sai âm thầm
 * với người có nhiều từ sai — đúng nhóm cần con số này nhất.
 *
 * Trả HAI con số cho mỗi nhóm:
 *   · `sai`   — tổng số từ đang trong danh sách sai (chưa thuộc hẳn);
 *   · `canOn` — trong số đó, bao nhiêu từ ĐÃ ĐẾN HẠN ôn theo lịch SM-2.
 * Hai con số dùng cho hai chỗ khác nhau, nên trả cả hai thay vì bắt chỗ gọi đoán.
 */
exports.getSummary = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        const profile = await UserProfile.findOne({ userId }).select('settings').lean();
        const lang = khoDangHoc(profile);

        const now = new Date();
        const dong = await WrongWord.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(String(userId)),
                    status: 'active',
                    ...WrongWord.langFilter(lang),
                },
            },
            {
                $group: {
                    _id: { source: '$source', part: '$part' },
                    sai: { $sum: 1 },
                    canOn: { $sum: { $cond: [{ $lte: ['$nextReviewDate', now] }, 1, 0] } },
                },
            },
        ]);

        const gop = (lay) => {
            const ra = {};
            for (const d of dong) {
                const k = lay(d._id) || '';
                if (!k) continue;
                const o = ra[k] || (ra[k] = { sai: 0, canOn: 0 });
                o.sai += d.sai;
                o.canOn += d.canOn;
            }
            return ra;
        };

        res.json({
            success: true,
            data: { lang, theoNguon: gop((x) => x.source), theoPart: gop((x) => x.part) },
        });
    } catch (error) {
        logger.error('Error in getSummary:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi đếm từ sai' });
    }
};

/**
 * @desc    Bulk update (để migrate data từ GameState.wrongWords cũ)
 * @route   POST /api/wrong-words/bulk
 * @access  Private
 */
exports.bulkUpdate = async (req, res) => {
    try {
        const { words } = req.body;
        const userId = req.user.id || req.user._id;

        if (!Array.isArray(words)) {
            return res.status(400).json({
                success: false,
                message: 'words phải là mảng'
            });
        }

        const userEmail = await resolveUserEmail(userId);
        const results = [];

        for (const wordData of words) {
            try {
                let wrongWord = await WrongWord.findOne({
                    userId,
                    wordId: wordData.id || wordData.wordId
                });

                if (wrongWord) {
                    // Cập nhật wrongCount nếu từ data cũ nhiều hơn
                    if (wordData.wrongCount && wordData.wrongCount > wrongWord.wrongCount) {
                        wrongWord.wrongCount = wordData.wrongCount;
                        wrongWord.calculatePriority();
                        await wrongWord.save();
                    }
                } else {
                    // Tạo mới
                    wrongWord = await WrongWord.create({
                        userId,
                        userEmail,
                        wordId: wordData.id || wordData.wordId,
                        en: wordData.en || wordData.word,
                        vn: wordData.vn || wordData.vi || wordData.meaning,
                        phonetic: wordData.phonetic,
                        type: wordData.type,
                        level: wordData.level,
                        part: wordData.part,
                        source: wordData.source,
                        expiresAt: ttlDate(),
                        example: wordData.example,
                        image: wordData.image,
                        wrongCount: wordData.wrongCount || 1,
                        lastWrongAt: wordData.lastWrongAt || new Date()
                    });
                    wrongWord.calculatePriority();
                    await wrongWord.save();
                }

                results.push({ wordId: wrongWord.wordId, success: true });
            } catch (err) {
                results.push({
                    wordId: wordData.id || wordData.wordId,
                    success: false,
                    error: err.message
                });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Bulk update hoàn tất',
            data: results
        });
    } catch (error) {
        logger.error('Error in bulkUpdate:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi bulk update',
            error: error.message
        });
    }
};
