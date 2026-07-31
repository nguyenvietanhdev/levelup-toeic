// ===================================
// VOCABULARY CONTROLLER (MongoDB Only)
// ===================================

const logger = require('../utils/logger');
const activityLogger = require('../utils/activityLogger');
const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function getVocabModel(req) {
    return req.query.lang === 'zh' ? VocabularyZh : Vocabulary;
}

function isZhRequest(req) {
    return req.query.lang === 'zh';
}

function pkField(req) {
    return isZhRequest(req) ? 'zh' : 'en';
}

function primaryValue(req, word) {
    return word?.[pkField(req)];
}

function validateVocabularyPayloadForLang(req, word) {
    if (isZhRequest(req) && word.en !== undefined && word.zh === undefined) {
        return 'Bạn đang nhập vào collection Tiếng Trung, vui lòng dùng key "zh" thay vì "en".';
    }
    if (!isZhRequest(req) && word.zh !== undefined && word.en === undefined) {
        return 'Bạn đang nhập vào collection Tiếng Anh, vui lòng dùng key "en" thay vì "zh".';
    }
    return null;
}

function normalizePartForLang(req, part) {
    return isZhRequest(req) ? part : String(part).toUpperCase();
}

// ===================================
// ALLOWED WORD TYPES (sync with frontend)
// ===================================
function validateAndNormalizeType(type) {
    if (!type) return '';
    return type.toLowerCase().trim();
}

function normalizeWord(word) {
    const lowerKeys = ['en', 'vn', 'type', 'synonyms', 'source'];
    const result = { ...word };
    for (const key of lowerKeys) {
        if (typeof result[key] === 'string') result[key] = result[key].toLowerCase();
    }
    return result;
}

// Public vocab filter — excludes private user uploads.
// Uses $ne so legacy docs without `scope` field still match.
const PUBLIC_FILTER = { scope: { $ne: 'private' } };

function getReadableVocabFilter(req) {
    if (isZhRequest(req)) {
        return {
            ...PUBLIC_FILTER,
            $or: [
                { en: { $type: 'string', $ne: '' } },
                { zh: { $type: 'string', $ne: '' } },
            ],
        };
    }
    return {
        ...PUBLIC_FILTER,
        en: { $type: 'string', $ne: '' },
    };
}

function normalizeVocabDocForResponse(req, word) {
    if (isZhRequest(req) && (!word.en || !String(word.en).trim()) && word.zh) {
        return { ...word, en: word.zh };
    }
    return word;
}

// ===================================
// CONTROLLER FUNCTIONS
// ===================================

/**
 * @desc    Get all vocabulary with filters and pagination
 * @route   GET /api/vocabulary
 * @access  Public
 */
exports.getAllVocabulary = async (req, res, next) => {
    try {
        const { limit = 20, page = 1, part, type, search, source } = req.query;
        const pageNum = parseInt(page);
        const limitNum = Math.min(parseInt(limit) || 20, 10000);
        const skip = (pageNum - 1) * limitNum;
        const Model = getVocabModel(req);

        let query = Model.find(getReadableVocabFilter(req));

        if (part) {
            query = query.where('part').equals(normalizePartForLang(req, part));
        }
        if (type) {
            query = query.where('type').equals(type.toLowerCase());
        }
        if (source) {
            query = query.where('source').equals(source.toLowerCase());
        }
        if (search) {
            query = query.or([
                { en: new RegExp(escapeRegex(search), 'i') },
                { vn: new RegExp(escapeRegex(search), 'i') }
            ]);
        }

        const total = await Model.countDocuments(query.getFilter());
        // Chỉ trả các field client thực sự dùng — cắt metadata (owner/scope/
        // timestamps/TTL...) để giảm payload list (init tải tới ~12k từ). Client
        // dùng: en/vn/zh/phonetic/part/synonyms/type/image/example/level/source.
        const vocabulary = await query
            .select('-ownerId -ownerEmail -uploadBatchId -expiresAt -createdBy -scope -createdAt -updatedAt -__v')
            .sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean().exec();

        res.json({
            success: true,
            count: vocabulary.length,
            total: total,
            page: pageNum,
            limit: limitNum,
            _source: 'mongodb',
            _filters: { part: part || null, type: type || null, source: source || null },
            data: vocabulary.map(word => normalizeVocabDocForResponse(req, word)),
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get vocabulary by ID (word)
 * @route   GET /api/vocabulary/:id
 * @access  Public
 */
exports.getVocabularyById = async (req, res, next) => {
    try {
        const word = await getVocabModel(req).findOne({ ...PUBLIC_FILTER, [pkField(req)]: req.params.id }).lean();

        if (!word) {
            return res.status(404).json({
                success: false,
                message: 'Word not found',
            });
        }

        res.json({
            success: true,
            data: normalizeVocabDocForResponse(req, word),
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get random vocabulary
 * @route   GET /api/vocabulary/random/:count
 * @access  Public
 */
exports.getRandomVocabulary = async (req, res, next) => {
    try {
        const count = Math.min(parseInt(req.params.count) || 10, 50);
        const { part, type } = req.query;
        const Model = getVocabModel(req);

        let query = Model.find(getReadableVocabFilter(req));

        if (part) {
            query = query.where('part').equals(normalizePartForLang(req, part));
        }
        if (type) {
            query = query.where('type').equals(type.toLowerCase());
        }

        const random = await query.sample(count);

        res.json({
            success: true,
            count: random.length,
            data: random.map(word => normalizeVocabDocForResponse(req, word)),
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get vocabulary by part
 * @route   GET /api/vocabulary/part/:part
 * @access  Public
 */
exports.getVocabularyByPart = async (req, res, next) => {
    try {
        const { part } = req.params;

        const filtered = await getVocabModel(req).find({ ...getReadableVocabFilter(req), part: normalizePartForLang(req, part) }).lean().exec();

        res.json({
            success: true,
            count: filtered.length,
            _source: 'mongodb',
            data: filtered.map(word => normalizeVocabDocForResponse(req, word)),
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Search vocabulary
 * @route   GET /api/vocabulary/search
 * @access  Public
 */
exports.searchVocabulary = async (req, res, next) => {
    try {
        const { q, limit = 20 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required',
            });
        }

        const searchFields = [
            { en: new RegExp(escapeRegex(q), 'i') },
            { vn: new RegExp(escapeRegex(q), 'i') },
            { phonetic: new RegExp(escapeRegex(q), 'i') },
        ];
        if (isZhRequest(req)) {
            searchFields.push({ zh: new RegExp(escapeRegex(q), 'i') });
        }

        const results = await getVocabModel(req).find({
            ...PUBLIC_FILTER,
            $or: searchFields,
        }).limit(parseInt(limit)).lean().exec();

        res.json({
            success: true,
            count: results.length,
            data: results.map(word => normalizeVocabDocForResponse(req, word)),
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get vocabulary statistics
 * @route   GET /api/vocabulary/stats
 * @access  Public
 */
exports.getVocabularyStats = async (req, res, next) => {
    try {
        const Model = getVocabModel(req);
        const stats = {
            total: await Model.countDocuments(PUBLIC_FILTER),
            byPart: {},
            byType: {},
            byLevel: {},
        };

        const partStats = await Model.aggregate([
            { $match: PUBLIC_FILTER },
            { $group: { _id: '$part', count: { $sum: 1 } } }
        ]);

        const typeStats = await Model.aggregate([
            { $match: PUBLIC_FILTER },
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);

        const levelStats = await Model.aggregate([
            { $match: PUBLIC_FILTER },
            { $group: { _id: '$level', count: { $sum: 1 } } }
        ]);

        partStats.forEach(s => stats.byPart[s._id] = s.count);
        typeStats.forEach(s => stats.byType[s._id] = s.count);
        levelStats.forEach(s => stats.byLevel[s._id] = s.count);

        res.json({
            success: true,
            data: stats,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get unique vocabulary parts
 * @route   GET /api/vocabulary/parts
 * @access  Public
 */
exports.getVocabularyParts = async (req, res, next) => {
    try {
        const match = { ...PUBLIC_FILTER };
        if (req.query.source) match.source = req.query.source;

        const grouped = await getVocabModel(req).aggregate([
            { $match: match },
            { $group: { _id: '$part', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);

        const counts = {};
        const data = [];
        for (const g of grouped) {
            if (!g._id) continue;
            data.push(g._id);
            counts[g._id] = g.count;
        }

        res.json({
            success: true,
            data,        // array of part names (backward-compatible)
            counts,      // { partName: count } respecting optional ?source=
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Upsert vocabulary array (Admin only) — insert or update by "en"
 * @route   POST /api/vocabulary/upsert
 * @access  Private/Admin
 */
exports.upsertVocabulary = async (req, res, next) => {
    try {
        const words = Array.isArray(req.body) ? req.body : [req.body];
        if (words.length === 0) return res.status(400).json({ success: false, message: 'Empty array' });
        const Model = getVocabModel(req);
        const pk = pkField(req);

        let inserted = 0, updated = 0, errors = [];

        for (const word of words) {
            const langError = validateVocabularyPayloadForLang(req, word);
            if (langError) { errors.push({ [pk]: primaryValue(req, word) || null, message: langError }); continue; }
            const value = primaryValue(req, word);
            if (!value) { errors.push({ [pk]: null, message: `Missing "${pk}"` }); continue; }
            try {
                const normalizedType = word.type ? validateAndNormalizeType(word.type) : 'noun';
                const doc = {
                    ...(pk !== 'en' && word.en !== undefined && { en: word.en }),
                    ...(pk !== 'zh' && word.zh !== undefined && { zh: word.zh }),
                    ...(word.vn        !== undefined && { vn: word.vn }),
                    ...(word.phonetic  !== undefined && { phonetic: word.phonetic }),
                    ...(word.part      !== undefined && { part: normalizePartForLang(req, word.part) }),
                    ...(word.type      !== undefined && { type: normalizedType }),
                    ...(word.level     !== undefined && { level: word.level }),
                    ...(word.synonyms  !== undefined && { synonyms: word.synonyms }),
                    ...(word.image     !== undefined && { image: word.image }),
                    ...(word.example   !== undefined && { example: word.example }),
                    ...(word.source    !== undefined && { source: word.source }),
                    updatedAt: new Date(),
                };
                const upsertKey = {
                    ...PUBLIC_FILTER,
                    [pk]: value,
                    ...(word.part   && { part: normalizePartForLang(req, word.part) }),
                    ...(word.source && { source: word.source.toLowerCase() }),
                    ...(word.vn     !== undefined && { vn: word.vn }),
                };
                const result = await Model.updateOne(
                    upsertKey,
                    { $set: doc, $setOnInsert: { [pk]: value, scope: 'public', createdAt: new Date() } },
                    { upsert: true }
                );
                if (result.upsertedCount > 0) inserted++;
                else updated++;
            } catch (e) {
                errors.push({ [pk]: value, message: e.message });
            }
        }

        res.json({ success: true, inserted, updated, errors });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create new vocabulary (Admin only)
 * @route   POST /api/vocabulary
 * @access  Private/Admin
 */
exports.createVocabulary = async (req, res, next) => {
    try {
        const { en, zh, vn, phonetic, part, type, synonyms, image, example, level, sources, source } = req.body;
        const Model = getVocabModel(req);
        const pk = pkField(req);
        const value = primaryValue(req, req.body);
        const langError = validateVocabularyPayloadForLang(req, req.body);

        if (langError) {
            return res.status(400).json({ success: false, message: langError });
        }

        if (!value || !vn || !part || !type) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${pk}, vn, part, type`,
            });
        }

        const sourceVal = (source || (Array.isArray(sources) ? sources[0] : sources) || 'custom').toLowerCase();

        const partVal = normalizePartForLang(req, part);
        const existing = await Model.findOne({ ...PUBLIC_FILTER, [pk]: value, part: partVal, source: sourceVal, vn });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Word already exists',
            });
        }

        const validatedType = validateAndNormalizeType(type);

        const newVocab = new Model({
            ...(en !== undefined && { en }),
            ...(zh !== undefined && { zh }),
            vn,
            phonetic: phonetic || '',
            part: partVal,
            type: validatedType,
            synonyms: synonyms || '',
            image: image || '',
            example: example || '',
            level: level || 'B1',
            source: sourceVal,
            scope: 'public',
        });

        await newVocab.save();

        await activityLogger.logActivity('vocabulary', 'add', {
            word: newVocab[pk],
            part: newVocab.part,
            type: newVocab.type
        });

        res.status(201).json({
            success: true,
            message: 'Vocabulary added successfully',
            data: newVocab,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update vocabulary (Admin only)
 * @route   PUT /api/vocabulary/:id
 * @access  Private/Admin
 */
exports.updateVocabulary = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { en, zh, vn, phonetic, part, type, example, synonyms, image, level, sources, source } = req.body;
        const Model = getVocabModel(req);
        const pk = pkField(req);
        const langError = validateVocabularyPayloadForLang(req, req.body);

        if (langError) {
            return res.status(400).json({ success: false, message: langError });
        }

        const word = await Model.findOne({ ...PUBLIC_FILTER, [pk]: id });

        if (!word) {
            return res.status(404).json({
                success: false,
                message: 'Word not found',
            });
        }

        const validatedType = type ? validateAndNormalizeType(type) : word.type;

        if (en) word.en = en;
        if (zh) word.zh = zh;
        if (vn) word.vn = vn;
        if (phonetic !== undefined) word.phonetic = phonetic;
        if (part) word.part = normalizePartForLang(req, part);
        if (type) word.type = validatedType;
        if (example !== undefined) word.example = example;
        if (synonyms !== undefined) word.synonyms = synonyms;
        if (image !== undefined) word.image = image;
        if (level) word.level = level;
        const sourceVal = source || (Array.isArray(sources) ? sources[0] : sources);
        if (sourceVal) word.source = sourceVal.toLowerCase();

        await word.save();

        await activityLogger.logActivity('vocabulary', 'update', {
            word: word[pk],
            part: word.part,
            type: word.type
        });

        res.json({
            success: true,
            message: 'Vocabulary updated successfully',
            data: word,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete vocabulary (Admin only)
 * @route   DELETE /api/vocabulary/:id
 * @access  Private/Admin
 */
exports.deleteVocabulary = async (req, res, next) => {
    try {
        const { id } = req.params;
        const Model = getVocabModel(req);
        const pk = pkField(req);

        const word = await Model.findOneAndDelete({ ...PUBLIC_FILTER, [pk]: id });

        if (!word) {
            return res.status(404).json({
                success: false,
                message: 'Word not found',
            });
        }

        await activityLogger.logActivity('vocabulary', 'delete', {
            word: word[pk],
            part: word.part,
        });

        res.json({
            success: true,
            message: 'Vocabulary deleted successfully',
            data: word,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get vocabulary by level
 * @route   GET /api/vocabulary/level/:level
 * @access  Public
 */
exports.getVocabularyByLevel = async (req, res, next) => {
    try {
        const { level } = req.params;
        const { limit = 20, page = 1 } = req.query;
        const Model = getVocabModel(req);

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const total = await Model.countDocuments({ ...PUBLIC_FILTER, level });
        const data = await Model.find({ ...PUBLIC_FILTER, level })
            .skip(skip)
            .limit(limitNum)
            .exec();

        res.json({
            success: true,
            count: data.length,
            total,
            page: pageNum,
            limit: limitNum,
            data,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Bulk import vocabulary (Admin only)
 * @route   POST /api/vocabulary/bulk
 * @access  Private/Admin
 */
exports.bulkImportVocabulary = async (req, res, next) => {
    try {
        const { words, source = 'custom' } = req.body;
        const Model = getVocabModel(req);
        const pk = pkField(req);

        if (!Array.isArray(words) || words.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'words array is required and must not be empty',
            });
        }

        let inserted = 0;
        let skipped = 0;
        const errors = [];

        for (let word of words) {
            try {
                const langError = validateVocabularyPayloadForLang(req, word);
                if (langError) {
                    errors.push(`Skipping word: ${langError} ${JSON.stringify(word)}`);
                    continue;
                }
                word = normalizeWord(word);
                const value = primaryValue(req, word);
                if (!value || !word.vn) {
                    errors.push(`Skipping word (missing ${pk}/vn): ${JSON.stringify(word)}`);
                    continue;
                }

                const partKey = normalizePartForLang(req, word.part || 'PART1');
                const srcKey  = (word.source || source).toLowerCase();
                const exists  = await Model.findOne({ [pk]: value, part: partKey, source: srcKey, vn: word.vn || '' });
                if (exists) {
                    skipped++;
                    continue;
                }

                const newVocab = new Model({
                    ...(word.en !== undefined && { en: word.en }),
                    ...(word.zh !== undefined && { zh: word.zh }),
                    vn: word.vn,
                    phonetic: word.phonetic || null,
                    part: partKey,
                    type: validateAndNormalizeType(word.type),
                    synonyms: word.synonyms || null,
                    image: word.image || null,
                    example: word.example || null,
                    level: word.level || 'B1',
                    source: word.source || source,
                });

                await newVocab.save();
                inserted++;
            } catch (err) {
                errors.push(`${primaryValue(req, word) || 'unknown'}: ${err.message}`);
            }
        }

        await activityLogger.logActivity('vocabulary', 'bulk-import', { inserted, skipped });

        res.json({
            success: true,
            message: `Bulk import completed`,
            inserted,
            skipped,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Bulk delete by array of "en" values
 * @route   DELETE /api/vocabulary/bulk
 */
exports.bulkDeleteVocabulary = async (req, res, next) => {
    try {
        const { ens } = req.body;
        if (!Array.isArray(ens) || ens.length === 0) {
            return res.status(400).json({ success: false, message: 'ens array is required' });
        }
        const result = await getVocabModel(req).deleteMany({ ...PUBLIC_FILTER, [pkField(req)]: { $in: ens } });
        await activityLogger.logActivity('vocabulary', 'bulk-delete', { count: result.deletedCount });
        res.json({ success: true, deleted: result.deletedCount });
    } catch (error) {
        next(error);
    }
};

const FILTER_DELETE_ALLOWED_FIELDS = ['part', 'type', 'source', 'level', 'en', 'zh', 'uploadBatchId', 'image'];

/**
 * @desc    Delete all docs matching one or more field=value conditions (AND)
 * @route   POST /api/vocabulary/filter-delete
 * Body: { filters: [{field, value}, ...] }  OR legacy { field, value }
 */
exports.filterDeleteVocabulary = async (req, res, next) => {
    try {
        // Normalise input: accept both legacy {field,value} and new {filters:[...]}
        let pairs = req.body.filters;
        if (!Array.isArray(pairs)) {
            const { field, value } = req.body;
            pairs = [{ field, value }];
        }

        // Validate & normalise each pair
        const conditions = {};
        for (const { field, value } of pairs) {
            if (!field || value === undefined || value === '') continue; // skip blank rows
            if (!FILTER_DELETE_ALLOWED_FIELDS.includes(field)) {
                return res.status(400).json({ success: false, message: `Invalid field "${field}". Allowed: ${FILTER_DELETE_ALLOWED_FIELDS.join(', ')}` });
            }
            conditions[field] = field === 'part' && !isZhRequest(req) ? value.toUpperCase() : value;
        }

        if (Object.keys(conditions).length === 0) {
            return res.status(400).json({ success: false, message: 'At least one field+value pair is required' });
        }

        const filter = { ...PUBLIC_FILTER, ...conditions };
        const Model = getVocabModel(req);
        const count = await Model.countDocuments(filter);
        const result = await Model.deleteMany(filter);
        await activityLogger.logActivity('vocabulary', 'filter-delete', { conditions, deleted: result.deletedCount });
        res.json({ success: true, deleted: result.deletedCount, matched: count });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete ALL public vocabulary (Admin only)
 * @route   DELETE /api/vocabulary/all
 */
exports.deleteAllVocabulary = async (req, res, next) => {
    try {
        const result = await getVocabModel(req).deleteMany(PUBLIC_FILTER);
        await activityLogger.logActivity('vocabulary', 'delete-all', { deleted: result.deletedCount });
        res.json({ success: true, deleted: result.deletedCount });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Replace all vocabulary with new dataset (Admin only)
 * @route   POST /api/vocabulary/replace
 * @access  Private/Admin
 */
exports.replaceVocabulary = async (req, res, next) => {
    try {
        const { words, source } = req.body;
        const Model = getVocabModel(req);
        const pk = pkField(req);

        if (!Array.isArray(words) || words.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'words array is required',
            });
        }

        await Model.deleteMany(source ? { source } : {});

        const invalid = words.find(word => validateVocabularyPayloadForLang(req, word) || !primaryValue(req, word));
        if (invalid) {
            return res.status(400).json({
                success: false,
                message: validateVocabularyPayloadForLang(req, invalid) || `Missing "${pk}"`,
            });
        }

        const docs = words.map(word => ({
            ...(word.en !== undefined && { en: word.en }),
            ...(word.zh !== undefined && { zh: word.zh }),
            vn: word.vn,
            phonetic: word.phonetic || null,
            part: normalizePartForLang(req, word.part || 'PART1'),
            type: validateAndNormalizeType(word.type),
            synonyms: word.synonyms || null,
            image: word.image || null,
            example: word.example || null,
            level: word.level || 'B1',
            source: word.source || source || 'custom',
        }));

        await Model.insertMany(docs, { ordered: false });

        await activityLogger.logActivity('vocabulary', 'replace', { count: docs.length, source });

        res.json({
            success: true,
            message: 'Vocabulary replaced successfully',
            count: docs.length,
        });

    } catch (error) {
        next(error);
    }
};
