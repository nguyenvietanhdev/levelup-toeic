// ===================================
// VOCAB EXPORT SERVICE
// ===================================
// Shared JSON / Excel-compatible CSV export for personal vocabulary.
// Used by the upload-manager modal and the expiry-export guard so the
// export logic lives in exactly one place.

export const EXPORT_FIELDS = [
    'en', 'vn', 'phonetic', 'part', 'synonyms', 'type', 'image', 'example', 'level', 'source',
];

/** Keep only the canonical fields (drop Mongo internals like _id/__v/owner). */
export function cleanWord(w) {
    const out = {};
    EXPORT_FIELDS.forEach(f => { out[f] = w[f] ?? ''; });
    return out;
}

function triggerDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Download a word list for one source.
 * @param {string} source
 * @param {Array<object>} words raw word docs
 * @param {'json'|'csv'} fmt
 * @returns {number} number of words exported (0 = nothing/aborted)
 */
export function downloadWords(source, words, fmt) {
    const cleaned = (words || []).map(cleanWord);
    if (cleaned.length === 0) return 0;
    const safe = String(source).replace(/[^\w.-]+/g, '_');
    if (fmt === 'json') {
        triggerDownload(`${safe}.json`, JSON.stringify(cleaned, null, 2), 'application/json');
    } else {
        // Leading BOM so Excel reads UTF-8 (Vietnamese) correctly.
        const header = EXPORT_FIELDS.join(',');
        const rows = cleaned.map(w => EXPORT_FIELDS.map(f => csvCell(w[f])).join(','));
        triggerDownload(`${safe}.csv`, '﻿' + [header, ...rows].join('\r\n'), 'text/csv;charset=utf-8');
    }
    return cleaned.length;
}
