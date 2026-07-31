// ===================================
// AI CONTROLLER (MongoDB-based)
// ===================================

const aiHelper = require('../utils/aiHelper');
const logger = require('../utils/logger');
const Vocabulary = require('../models/Vocabulary');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const _explainCache = new Map();
const EXPLAIN_TTL = 24 * 60 * 60 * 1000;

function getExplainCache(key) {
    const e = _explainCache.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > EXPLAIN_TTL) { _explainCache.delete(key); return null; }
    return e.data;
}
function setExplainCache(key, data) {
    _explainCache.set(key, { data, ts: Date.now() });
    if (_explainCache.size > 500) {
        const oldest = [..._explainCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        _explainCache.delete(oldest[0]);
    }
}

/**
 * @desc    Explain word with AI
 * @route   POST /api/ai/explain
 * @access  Public
 */
exports.explainWord = async (req, res, next) => {
    try {
        const { wordEn } = req.body;

        if (!wordEn) {
            return res.status(400).json({
                success: false,
                message: 'Word is required (wordEn)',
            });
        }

        const cacheKey = wordEn.toLowerCase().trim();
        const cached = getExplainCache(cacheKey);
        if (cached) return res.json({ ...cached, _cached: true });

        let word = await Vocabulary.findOne({ scope: { $ne: 'private' }, en: new RegExp(`^${escapeRegex(wordEn)}$`, 'i') });

        // If word not found in database, create a temporary word object for AI to explain
        if (!word) {
            word = {
                en: wordEn,
                vn: '',
                phonetic: '',
                type: '',
            };
        }

        logger.debug(`\n[AI REQUEST] Explain Word: "${word.en}"`);
        const result = await aiHelper.explainWord(word);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to generate explanation',
                error: result.error,
            });
        }

        const responseObj = {
            success: true,
            word: {
                en: word.en,
                vn: word.vn || 'AI will explain',
                phonetic: word.phonetic || '',
            },
            explanation: result.content,
        };
        setExplainCache(cacheKey, responseObj);
        res.json(responseObj);

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Generate questions for word
 * @route   POST /api/ai/generate-questions
 * @access  Public
 */
exports.generateQuestions = async (req, res, next) => {
    try {
        const { wordEn, count = 5, type = 'multiple-choice' } = req.body;

        if (!wordEn) {
            return res.status(400).json({
                success: false,
                message: 'Word is required (wordEn)',
            });
        }

        const word = await Vocabulary.findOne({ scope: { $ne: 'private' }, en: new RegExp(`^${escapeRegex(wordEn)}$`, 'i') });

        if (!word) {
            return res.status(404).json({
                success: false,
                message: 'Word not found in vocabulary',
            });
        }

        logger.debug(`\n[AI REQUEST] Generate Questions: "${word.en}" (count: ${count}, type: ${type})`);
        const result = await aiHelper.generateQuestions(word, type, count);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to generate questions',
                error: result.error,
            });
        }

        res.json({
            success: true,
            word: word.en,
            type,
            count: result.questions.length,
            questions: result.questions,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Check grammar with AI
 * @route   POST /api/ai/check-grammar
 * @access  Public
 */
exports.checkGrammar = async (req, res, next) => {
    try {
        const { sentence } = req.body;

        if (!sentence) {
            return res.status(400).json({
                success: false,
                message: 'Sentence is required',
            });
        }

        logger.debug(`\n[AI REQUEST] Check Grammar: "${sentence.substring(0, 50)}${sentence.length > 50 ? '...' : ''}"`);
        const result = await aiHelper.checkGrammar(sentence);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to check grammar',
                error: result.error,
            });
        }

        res.json({
            success: true,
            sentence,
            ...result.analysis,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Chat with AI tutor
 * @route   POST /api/ai/chat
 * @access  Private
 */
exports.chatWithTutor = async (req, res, next) => {
    try {
        const { message, conversationHistory = [] } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message is required',
            });
        }

        logger.debug(`\n[AI REQUEST] Chat with Tutor: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
        const result = await aiHelper.chatWithTutor(message, conversationHistory);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to get AI response',
                error: result.error,
            });
        }

        res.json({
            success: true,
            response: result.content,
            conversationHistory: [
                ...conversationHistory,
                { role: 'user', content: message },
                { role: 'assistant', content: result.content }
            ]
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Translate English sentence to Vietnamese
 * @route   POST /api/ai/translate
 * @access  Public
 */
exports.translateSentence = async (req, res, next) => {
    try {
        const { sentence } = req.body;

        if (!sentence) {
            return res.status(400).json({
                success: false,
                message: 'Sentence is required',
            });
        }

        logger.debug(`\n[AI REQUEST] Translate: "${sentence.substring(0, 50)}${sentence.length > 50 ? '...' : ''}"`);
        const result = await aiHelper.translateSentence(sentence);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to translate sentence',
                error: result.error,
            });
        }

        res.json({
            success: true,
            original: sentence,
            translation: result.content,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Lookup word information using AI (auto-fill form)
 * @route   POST /api/ai/lookup-word
 * @access  Public
 */
exports.lookupWord = async (req, res, next) => {
    try {
        const { word } = req.body;

        if (!word) {
            return res.status(400).json({
                success: false,
                message: 'Word is required',
            });
        }

        // Validate word (only allow letters, spaces, hyphens)
        const cleanWord = word.trim();
        if (!/^[a-zA-Z\s\-']+$/.test(cleanWord)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid word format. Only English letters allowed.',
            });
        }

        logger.debug(`\n[AI REQUEST] Lookup Word: "${cleanWord}"`);
        const result = await aiHelper.lookupWord(cleanWord);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to lookup word information',
                error: result.error,
            });
        }

        res.json({
            success: true,
            data: result.data,
        });

    } catch (error) {
        next(error);
    }
};