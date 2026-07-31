// ===================================
// VOCABULARY DATASETS CONTROLLER
// ===================================
// Split out of vocabularyController (P4). Self-contained: list available
// sources/files + switch active dataset. Only the Vocabulary model.
// Verbatim move; behaviour unchanged. routes/vocabulary.js imports here.

const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');

function getVocabModel(req) {
    return req.query.lang === 'zh' ? VocabularyZh : Vocabulary;
}

/**
 * @desc    List available vocabulary sources (replaces JSON file listing)
 * @route   GET /api/vocabulary/files
 * @access  Public
 */
exports.getAvailableFiles = async (req, res, next) => {
    try {
        const sourceStats = await getVocabModel(req).aggregate([
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const DISPLAY_NAMES = {
            'ets2024': 'ETS 2024',
            'ets2023': 'ETS 2023',
            'ets2026': 'ETS 2026',
            '600words': '600 Essential Words',
            'vocabulary': 'Vocabulary',
            'keytoeic': 'Key TOEIC',
            'prepositions': 'Prepositions',
            '12thi': '12 Thì',
            'e2h9': 'E2H9',
            'e2xa': 'E2XA',
            'ets': 'ETS',
            'custom': 'Custom',
        };

        const sources = sourceStats.map(s => ({
            source: s._id || 'unknown',
            displayName: DISPLAY_NAMES[s._id] || s._id,
            wordCount: s.count,
        }));

        res.json({
            success: true,
            total: sources.length,
            data: sources,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Switch active source (filter by source - replaces JSON file switch)
 * @route   POST /api/vocabulary/switch/:filename
 * @access  Private/Admin
 */
exports.switchVocabularyFile = async (req, res, next) => {
    try {
        const { filename } = req.params;
        const source = filename.replace('.json', '').toLowerCase();

        const count = await getVocabModel(req).countDocuments({ source });

        if (count === 0) {
            return res.status(404).json({
                success: false,
                message: `Source "${source}" not found in database`,
            });
        }

        res.json({
            success: true,
            message: `Active source set to "${source}"`,
            source,
            count,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all available vocabulary sources with counts
 * @route   GET /api/vocabulary/sources
 * @access  Public
 * Feature: "Chọn đề luyện tập" - List available vocabulary datasets
 */
exports.getVocabularySources = async (req, res, next) => {
    try {
        const sourceStats = await getVocabModel(req).aggregate([
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const sources = sourceStats.map(s => ({
            source: s._id || 'unknown',
            count: s.count,
        }));

        res.json({
            success: true,
            total: sources.length,
            data: sources,
        });

    } catch (error) {
        next(error);
    }
};


module.exports = exports;
