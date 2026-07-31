// ===================================
// VOCABULARY DEDUP CONTROLLER
// ===================================
// Split out of vocabularyController (P4). Self-contained: scan/remove
// duplicate entries. DUP_GROUP_KEY is local to this cluster. Verbatim
// move; behaviour unchanged. routes/vocabulary.js imports these here now.

const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');
const activityLogger = require('../utils/activityLogger');

function getVocabModel(req) {
    return req.query.lang === 'zh' ? VocabularyZh : Vocabulary;
}

// Normalized composite duplicate key: source + part + en (case-insensitive,
// trimmed). This is THE definition of a duplicate across the app.
const DUP_GROUP_KEY = {
    en: { $toLower: { $trim: { input: { $ifNull: ['$en', { $ifNull: ['$zh', ''] }] } } } },
    part: { $toLower: { $trim: { input: { $ifNull: ['$part', ''] } } } },
    source: { $toLower: { $trim: { input: { $ifNull: ['$source', ''] } } } },
};

/**
 * @desc    Scan duplicate vocabulary entries in the DATABASE
 *          (duplicate key = source + part + en)
 * @route   GET /api/vocabulary/duplicates?source=&part=
 * @access  Public (admin tool)
 */
exports.scanDuplicates = async (req, res, next) => {
    try {
        const match = {};
        if (req.query.source) match.source = req.query.source;
        if (req.query.part) match.part = req.query.part;

        const groups = await getVocabModel(req).aggregate([
            { $match: match },
            {
                $group: {
                    _id: DUP_GROUP_KEY,
                    count: { $sum: 1 },
                    docs: {
                        $push: {
                            _id: '$_id', en: '$en', vn: '$vn',
                            part: '$part', source: '$source',
                        },
                    },
                },
            },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const totalDuplicates = groups.reduce((sum, g) => sum + (g.count - 1), 0);

        res.json({
            success: true,
            duplicateGroups: groups.length,
            totalDuplicates,
            data: groups.map(g => ({
                en: g._id.en,
                part: g._id.part,
                source: g._id.source,
                count: g.count,
                docs: g.docs,
            })),
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Remove duplicate vocabulary entries (Admin only)
 *          Duplicate key = source + part + en. Keeps one, deletes the rest.
 * @route   POST /api/vocabulary/remove-duplicates/:filename
 * @access  Private/Admin
 */
exports.removeDuplicates = async (req, res, next) => {
    try {
        const { filename } = req.params;
        const source = filename !== 'all' ? filename.replace('.json', '').toLowerCase() : null;

        const matchStage = source ? { $match: { source } } : { $match: {} };

        const Model = getVocabModel(req);
        const duplicates = await Model.aggregate([
            matchStage,
            { $group: { _id: DUP_GROUP_KEY, count: { $sum: 1 }, ids: { $push: '$_id' } } },
            { $match: { count: { $gt: 1 } } }
        ]);

        let removed = 0;
        for (const dup of duplicates) {
            const idsToRemove = dup.ids.slice(1);
            await Model.deleteMany({ _id: { $in: idsToRemove } });
            removed += idsToRemove.length;
        }

        await activityLogger.logActivity('vocabulary', 'remove-duplicates', { removed, source });

        res.json({
            success: true,
            message: `Removed ${removed} duplicate entries`,
            duplicateGroups: duplicates.length,
            removed,
        });

    } catch (error) {
        next(error);
    }
};

module.exports = exports;
