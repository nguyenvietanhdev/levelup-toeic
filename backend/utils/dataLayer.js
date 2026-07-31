/**
 * Data Layer - Hybrid Strategy
 * Priority: MongoDB → In-Memory Cache → Local JSON Files
 *
 * Sử dụng:
 *   const data = await dataLayer.getVocabulary(filters);
 */

const fs = require('fs/promises');
const path = require('path');
const logger = require('./logger');

// ===================================
// CACHE
// ===================================
const cache = {
    vocabulary: null,
    toeicTests: null,
    toeicQuestions: null,
    lastUpdate: {}
};

// ===================================
// HELPER: Read JSON with fallback
// ===================================
async function readJSONFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.warn(`Failed to read JSON: ${filePath}`, { error: error.message });
        return null;
    }
}

// ===================================
// HELPER: Fetch with timeout
// ===================================
async function fetchWithTimeout(promise, timeoutMs = 2000) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// ===================================
// CORE FUNCTION: Get Data with Fallback
// ===================================

/**
 * Get vocabulary with fallback strategy
 * Layer 1: MongoDB (if connected)
 * Layer 2: In-memory cache
 * Layer 3: Local JSON files
 */
async function getVocabulary(filters = {}, Vocabulary = null) {
    const source = { layer: 'unknown', details: '' };

    try {
        // LAYER 1: Try MongoDB (if model provided)
        if (Vocabulary) {
            try {
                logger.debug('Attempting to fetch vocabulary from MongoDB...');

                let query = Vocabulary.find();

                // Apply filters
                if (filters.part) {
                    query = query.where('part').equals(filters.part.toUpperCase());
                }
                if (filters.type) {
                    query = query.where('type').equals(filters.type);
                }
                if (filters.source) {
                    query = query.where('source').equals(filters.source);
                }
                if (filters.search) {
                    query = query.or([
                        { en: new RegExp(filters.search, 'i') },
                        { vn: new RegExp(filters.search, 'i') }
                    ]);
                }

                // Apply pagination
                if (filters.limit) {
                    query = query.limit(parseInt(filters.limit));
                }
                if (filters.skip) {
                    query = query.skip(parseInt(filters.skip));
                }

                // Fetch with timeout
                const data = await fetchWithTimeout(query.exec(), 2000);

                if (data && data.length > 0) {
                    cache.vocabulary = data;
                    source.layer = 'mongodb';
                    source.count = data.length;
                    logger.info(`✅ Vocabulary loaded from MongoDB (${data.length} records)`, source);
                    return { data, source };
                }
            } catch (mongoError) {
                logger.warn('⚠️ MongoDB failed, falling back...', {
                    error: mongoError.message,
                    timeout: mongoError.message.includes('Timeout')
                });
            }
        }

        // LAYER 2: Use in-memory cache
        if (cache.vocabulary && cache.vocabulary.length > 0) {
            let filtered = [...cache.vocabulary];

            // Apply filters to cache
            if (filters.part) {
                filtered = filtered.filter(w => w.part === filters.part.toUpperCase());
            }
            if (filters.type) {
                filtered = filtered.filter(w => w.type === filters.type);
            }
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                filtered = filtered.filter(w =>
                    w.en.toLowerCase().includes(searchLower) ||
                    w.vn.toLowerCase().includes(searchLower)
                );
            }

            // Pagination
            if (filters.limit) {
                const skip = filters.skip || 0;
                filtered = filtered.slice(skip, skip + parseInt(filters.limit));
            }

            source.layer = 'cache';
            source.count = filtered.length;
            logger.info(`✅ Vocabulary loaded from cache (${filtered.length} records)`, source);
            return { data: filtered, source };
        }

        // LAYER 3: Load from local JSON files
        logger.warn('⚠️ Cache empty, loading from JSON files...');
        const jsonPath = path.join(__dirname, '..', 'public', 'data', 'vocabulary.json');
        let jsonData = await readJSONFile(jsonPath);

        if (!jsonData) {
            jsonData = [];
        }

        // Cache it for future use
        cache.vocabulary = jsonData;

        // Apply filters
        let filtered = [...jsonData];
        if (filters.part) {
            filtered = filtered.filter(w => w.part === filters.part.toUpperCase());
        }
        if (filters.type) {
            filtered = filtered.filter(w => w.type === filters.type);
        }
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(w =>
                w.en.toLowerCase().includes(searchLower) ||
                w.vn.toLowerCase().includes(searchLower)
            );
        }

        if (filters.limit) {
            const skip = filters.skip || 0;
            filtered = filtered.slice(skip, skip + parseInt(filters.limit));
        }

        source.layer = 'json_file';
        source.count = filtered.length;
        logger.info(`✅ Vocabulary loaded from JSON files (${filtered.length} records)`, source);
        return { data: filtered, source };

    } catch (error) {
        logger.error('Fatal: Could not load vocabulary from any source', { error: error.message });
        throw error;
    }
}

/**
 * Initialize cache on startup
 */
async function initializeCache() {
    try {
        logger.info('Initializing data layer cache...');

        const jsonPath = path.join(__dirname, '..', 'public', 'data', 'vocabulary.json');
        cache.vocabulary = await readJSONFile(jsonPath);

        logger.info(`✅ Cache initialized - vocabulary: ${cache.vocabulary ? cache.vocabulary.length : 0} records`);
    } catch (error) {
        logger.warn('Failed to initialize cache', { error: error.message });
    }
}

/**
 * Refresh cache from JSON (when file changes)
 */
async function refreshCacheFromJSON() {
    try {
        const jsonPath = path.join(__dirname, '..', 'public', 'data', 'vocabulary.json');
        cache.vocabulary = await readJSONFile(jsonPath);
        logger.info('✅ Cache refreshed from JSON files');
    } catch (error) {
        logger.warn('Failed to refresh cache', { error: error.message });
    }
}

/**
 * Update cache after MongoDB insert
 */
function updateCacheFromMongoDB(data) {
    if (Array.isArray(data)) {
        cache.vocabulary = data;
    }
    logger.debug('Cache updated from MongoDB');
}

module.exports = {
    getVocabulary,
    initializeCache,
    refreshCacheFromJSON,
    updateCacheFromMongoDB,
    fetchWithTimeout,
    readJSONFile,
    cache: () => cache // For debugging
};
