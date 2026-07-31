// ===================================
// VOCAB UPLOAD SERVICE
// ===================================
// Pure normalization for uploaded vocabulary items, extracted from the
// inline `normalize` closure in TopNav.jsx (used at 3 call sites).
// The upload modal's DOM/markup wiring stays in TopNav for now — that
// component split is a later phase.

const lower = s => (s || '').toLowerCase().trim();
const upper = s => (s || '').toUpperCase().trim();
const capFirst = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/**
 * Normalize a raw vocabulary object to the canonical casing rules:
 * most fields lowercased, part/level uppercased, example sentence-cased.
 * Behaviour identical to the previous inline `normalize`.
 */
export function normalizeVocabItem(obj) {
    return {
        en: lower(obj.en),
        vn: lower(obj.vn),
        part: upper(obj.part),
        source: lower(obj.source),
        type: lower(obj.type),
        level: upper(obj.level),
        phonetic: lower(obj.phonetic),
        example: obj.example ? capFirst(obj.example.trim()) : '',
        synonyms: lower(obj.synonyms),
        image: lower(obj.image || ''),
    };
}
