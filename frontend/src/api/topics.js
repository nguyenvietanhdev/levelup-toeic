import { getVocabLang } from '@api/vocabulary.js';

// ===================================
// TOPICS API SERVICE
// ===================================
// Shared (public) vocabulary topic list. Raw fetch, caller does r.json()
// — exact shape preserved from topicSelector. Pure move.

export const TopicsAPI = {
    /** @returns raw Response (caller does await res.json()). */
    listRaw() {
        return fetch(`/api/topics?lang=${getVocabLang()}`);
    },
};
