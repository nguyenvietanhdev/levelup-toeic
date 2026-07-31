// ===================================
// AI API SERVICE
// ===================================

const AiAPI = {
    /**
     * Translate a sentence to Vietnamese
     */
    async translate(sentence) {
        const token = typeof ServerStorage !== 'undefined' ? ServerStorage.token : null;
        const res = await fetch('/api/ai/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ sentence }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Translation failed');
        return json.translation;
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AiAPI;
}
