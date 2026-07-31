// ===================================
// HTTP CLIENT - API Wrapper
// ===================================

import { Config } from '@game/config.js';
import { EventBus } from '@game/eventBus.js';
import { getVocabLang, normalizeVocabularyWords } from '@api/vocabulary.js';
import { logger } from '@lib/logger.js';

export const Http = {

    get baseURL() {
        return Config.api?.baseUrl || '/api';
    },

    // Default headers
    defaultHeaders: {
        'Content-Type': 'application/json'
    },

    // Request timeout
    timeout: 30000,

    /**
     * Make HTTP request
     */
    async request(url, options = {}) {
        // ✅ Nếu url không bắt đầu bằng http, thêm baseURL
        const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;

        const config = {
            method: options.method || 'GET',
            headers: { ...this.defaultHeaders, ...options.headers },
            ...options
        };

        const token = options.token || Http._getToken();
        if (token && token.length > 20) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        // Add body if present
        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            config.signal = controller.signal;

            logger.log('🌐 HTTP Request:', config.method, fullUrl);

            const response = await fetch(fullUrl, config);

            clearTimeout(timeoutId);

            // Parse response
            const contentType = response.headers.get('content-type');
            let data;

            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (response.status === 401) {
                // Chỉ emit nếu request có token (đang đăng nhập nhưng token hết hạn)
                if (Http._getToken()) EventBus.emit('auth:expired');
                return { success: false, error: data.message || 'Token expired', code: 'UNAUTHORIZED' };
            }

            if (response.status === 423) {
                const lockType = data.lockType || 'unknown';
                EventBus.emit('account:locked', { lockType, message: data.message });
                return { success: false, error: data.message, code: 'ACCOUNT_LOCKED', locked: true, lockType, data };
            }

            if (!response.ok) {
                throw new Error(data.message || `HTTP Error: ${response.status}`);
            }

            logger.log('✅ HTTP Response:', response.status);

            return { success: true, data, status: response.status };

        } catch (error) {
            console.error('❌ HTTP Request Error:', error);

            if (error.name === 'AbortError') {
                return { success: false, error: 'Request timeout', code: 'TIMEOUT' };
            }

            return { success: false, error: error.message, code: 'ERROR' };
        }
    },

    /**
     * GET request
     */
    async get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    },

    /**
     * POST request
     */
    async post(url, data, options = {}) {
        return this.request(url, { ...options, method: 'POST', body: data });
    },

    /**
     * PUT request
     */
    async put(url, data, options = {}) {
        return this.request(url, { ...options, method: 'PUT', body: data });
    },

    /**
     * PATCH request
     */
    async patch(url, data, options = {}) {
        return this.request(url, { ...options, method: 'PATCH', body: data });
    },

    /**
     * DELETE request
     */
    async delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    },

    async loadVocabulary() {
        // Load all vocabulary from MongoDB — no JSON fallback
        const res = await fetch(`/api/vocabulary?limit=9999&page=1&lang=${getVocabLang()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data)) {
            return { success: false, error: 'Invalid vocabulary response', data: [] };
        }
        return { success: true, data: normalizeVocabularyWords(json.data) };
    },

    _getToken() {
        try {
            const stored = localStorage.getItem('authToken');
            if (!stored) return null;
            const parsed = JSON.parse(stored);
            return parsed.token || stored;
        } catch { return null; }
    }
};

// ===================================
// API ENDPOINTS (for backend)
// ===================================

export const API = {

    /**
     * Auth endpoints
     */
    auth: {
        async register(userData) {
            return Http.post('/auth/register', userData);
        },

        async login(credentials) {
            return Http.post('/auth/login', credentials);
        },

        async logout() {
            return Http.post('/auth/logout');
        },

        async getMe() {
            return Http.get('/auth/me');
        },

        async updateProfile(updates) {
            return Http.put('/auth/profile', updates);
        },

        async uploadAvatar(blob) {
            const formData = new FormData();
            formData.append('avatar', blob, 'avatar.jpg');
            const token = Http._getToken();
            const res = await fetch('/api/auth/avatar', {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData,
            });
            return res.json();
        },

        async changePassword(passwords) {
            return Http.put('/auth/password', passwords);
        },

        async syncProgress(progressData) {
            return Http.post('/auth/sync', progressData);
        }
    },

    /**
     * User state endpoints
     */
    user: {
        async getState() {
            return Http.get('/user/state');
        },

        async saveState(state) {
            // ⚡️ FIX: Đảm bảo dailyQuests luôn là một mảng object trước khi gửi
            // Vấn đề: Đôi khi state.quests.daily bị biến thành chuỗi không hợp lệ.
            if (state && state.quests && typeof state.quests.daily === 'string') {
                console.warn('⚠️ Detected stringified dailyQuests on client. Attempting to parse...');
                try {
                    // Chuyển chuỗi JS thành chuỗi JSON hợp lệ để parse
                    const jsonString = state.quests.daily
                        .replace(/'/g, '"') // Thay thế ' bằng "
                        .replace(/(\w+):/g, '"$1":') // Thêm "" cho key
                        .replace(/undefined/g, 'null'); // Thay thế undefined bằng null

                    state.quests.daily = JSON.parse(jsonString);
                    logger.log('✅ Successfully parsed dailyQuests back to array.');
                } catch (e) {
                    console.error('❌ Failed to parse dailyQuests string on client before sending:', e);
                }
            }
            // ✅ FIX: Don't wrap state in another object
            return Http.post('/user/state', state);
        },

        async updateResources(resources) {
            return Http.patch('/user/resources', resources);
        },

        async updateProgress(progress) {
            return Http.patch('/user/progress', progress);
        },

        async addXp(amount) {
            return Http.post('/user/xp', { amount });
        },

        async unlockAchievement(achievementId, rewards = {}) {
            return Http.post('/user/achievement', { achievementId, ...rewards });
        },

        async updateQuests(quests) {
            return Http.patch('/user/quests', { quests });
        },

        async resetProgress(confirmUserId) {
            return Http.delete('/user/progress', { body: { confirmUserId } });
        }
    },

    /**
     * Shop endpoints
     */
    shop: {
        async purchase(itemId, quantity = 1) {
            return Http.post('/shop/purchase', { itemId, quantity });
        }
    },

    /**
     * Vocabulary endpoints
     */
    vocabulary: {
        async getAll(params = {}) {
            const query = new URLSearchParams(params).toString();
            return Http.get(`/vocabulary${query ? '?' + query : ''}`);
        },

        async getByPart(part) {
            return Http.get(`/vocabulary/part/${part}`);
        },

        async getById(id) {
            return Http.get(`/vocabulary/${id}`);
        },

        async getRandom(count, params = {}) {
            const query = new URLSearchParams(params).toString();
            return Http.get(`/vocabulary/random/${count}${query ? '?' + query : ''}`);
        },

        async search(query) {
            return Http.get(`/vocabulary/search?q=${encodeURIComponent(query)}`);
        },

        async getStats() {
            return Http.get('/vocabulary/stats');
        }
    },

    /**
     * AI endpoints
     */
    ai: {
        async explainWord(wordEn) {
            return Http.post('/ai/explain', { wordEn });
        },

        async generateQuestions(wordEn, count = 5, type = 'multiple-choice') {
            return Http.post('/ai/generate-questions', { wordEn, count, type });
        },

        async checkGrammar(sentence) {
            return Http.post('/ai/check-grammar', { sentence });
        },

        async chat(message, conversationHistory = []) {
            return Http.post('/ai/chat', { message, conversationHistory });
        }
    },

    /**
     * Leaderboard endpoints (if implemented)
     */
    leaderboard: {
        async getDaily() {
            return Http.get('/leaderboard/daily');
        },

        async getWeekly() {
            return Http.get('/leaderboard/weekly');
        },

        async getAllTime() {
            return Http.get('/leaderboard/all-time');
        },

        async submitScore(scoreData) {
            return Http.post('/leaderboard/submit', scoreData);
        }
    }
};

