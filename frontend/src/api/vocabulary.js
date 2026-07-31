// ===================================
// VOCABULARY API SERVICE
// ===================================

export function getVocabLang() {
    try {
        const stored = localStorage.getItem('vocabLang');
        if (stored === 'en' || stored === 'zh') return stored;
        return window.GameState?.state?.settings?.vocabLang || 'en';
    } catch {
        return 'en';
    }
}

export function normalizeVocabularyWord(word, lang = getVocabLang()) {
    if (!word || typeof word !== 'object') return word;
    if (lang !== 'zh') return word;

    const primary = typeof word.zh === 'string' && word.zh.trim()
        ? word.zh.trim()
        : word.en;

    return {
        ...word,
        en: word.en || primary,
        word: word.word || primary,
    };
}

export function normalizeVocabularyWords(words, lang = getVocabLang()) {
    return Array.isArray(words)
        ? words.map(word => normalizeVocabularyWord(word, lang)).filter(word => word?.en)
        : [];
}

export const VocabularyAPI = {
    /**
     * Get list of available vocabulary sources from MongoDB
     */
    async getFiles() {
        const res = await fetch(`/api/vocabulary/files?lang=${getVocabLang()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.data || [];
    },

    /**
     * Get all words for a given source from MongoDB
     */
    async getWordsBySource(source) {
        const res = await fetch(`/api/vocabulary?source=${encodeURIComponent(source)}&limit=9999&page=1&lang=${getVocabLang()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return normalizeVocabularyWords(json.data || []);
    },

    /**
     * Search vocabulary. Resolves to `{ success:false }` on network error
     * (never throws) — matches the previous inline behaviour in
     * SearchResults.jsx.
     * @returns {Promise<{success:boolean,data?:any[]}>}
     */
    async search(query, limit = 20) {
        return fetch(`/api/vocabulary/search?q=${encodeURIComponent(query)}&limit=${limit}&lang=${getVocabLang()}`)
            .then(r => r.json())
            .then(json => json?.success ? { ...json, data: normalizeVocabularyWords(json.data || []) } : json)
            .catch(() => ({ success: false }));
    },
};

if (typeof window !== 'undefined') {
    window.VocabularyAPI = VocabularyAPI;
}
