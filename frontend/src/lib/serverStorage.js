// ===================================
// SERVER STORAGE MANAGER
// ===================================

import { API } from '@api/http.js';
import { logger } from './logger.js';

export const ServerStorage = {
    token: null,
    cache: {
        lastFetch: null,
        cacheDuration: 30000 // 30s
    },

    // -------------------------------
    // Initialization
    // -------------------------------
    init() {
        // Token is now managed by Auth and Http modules.
        // We just need to read it when necessary.
        this.token = this.getToken();
        logger.log('ServerStorage initialized.');
    },

    getToken() {
        const tokenObj = localStorage.getItem('authToken');
        if (tokenObj) {
            try {
                const parsed = JSON.parse(tokenObj);
                return parsed.token || tokenObj;
            } catch {
                return tokenObj;
            }
        }
        return null;
    },

    setToken(token) {
        this.token = token;
        // Also update localStorage for consistency on reload
        localStorage.setItem('authToken', JSON.stringify({ token }));
        logger.log('🔑 ServerStorage: Token updated.');
    },

    clearToken() {
        this.token = null;
        localStorage.removeItem('authToken');
        logger.log('🔑 ServerStorage: Token cleared.');
    },

    isCacheValid() {
        if (!this.cache.lastFetch) return false;
        return (Date.now() - this.cache.lastFetch) < this.cache.cacheDuration;
    },

    // -------------------------------
    // Game State
    // -------------------------------
    async getGameState() {
        logger.log('🌐 Fetching game state from server via API module...');
        // ✅ FIX: Pass the token explicitly to the API call
        const response = await API.user.getState({
            headers: { Authorization: `Bearer ${this.token}` }
        });
        this.cache.lastFetch = Date.now();
        return response.success ? response.data : null;
    },

    async saveGameState(state) {
        // Check if user is a guest - don't attempt server sync
        if (state?.user?.isGuest === true) {
            console.info('👤 Guest mode - skipping server sync');
            return false;
        }

        // Check if we have a token
        const token = this.getToken();
        if (!token || token.length < 20) {
            console.info('🔑 No auth token - skipping server sync');
            return false;
        }

        try {
            // ✅ FIX: Pass the token explicitly
            const response = await API.user.saveState(state, {
                headers: { Authorization: `Bearer ${token}` }
            });
            this.cache.lastFetch = Date.now();

            if (!response.success) {
                console.error('❌ Server sync failed:', response.error || 'Unknown error');
            }

            return response.success;
        } catch (error) {
            console.error('❌ Server sync exception:', error);
            return false;
        }
    },

    // -------------------------------
    // Atomic updates
    // -------------------------------
    async updateResources(resources) {
        try {
            const response = await API.user.updateResources(resources, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return response.success ? response.data : null;
        } catch (err) {
            console.error('❌ Failed to update resources:', err);
            return null;
        }
    },

    // -------------------------------
    // ✅ NEW: Sync Settings to Server
    // -------------------------------
    async syncSettings(settings) {
        logger.log('📤 Syncing settings to server via API module...');
        const response = await API.auth.syncProgress({ settings }, {
            headers: { Authorization: `Bearer ${this.token}` }
        });
        return response.success;
    },

    // -------------------------------
    // Actions
    // -------------------------------
    async addXp(amount) {
        try {
            const response = await API.user.addXp(amount, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return response.success ? response.data : null;
        } catch (err) {
            console.error('❌ Failed to add XP:', err);
            return null;
        }
    },

    async purchaseItem(itemId) {
        try {
            const response = await API.shop.purchase(itemId, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return response.success ? response.data : null;
        } catch (err) {
            console.error('❌ Failed to purchase item:', err);
            throw err; // Re-throw để Shop UI có thể handle
        }
    },

    // -------------------------------
    // Utility
    // -------------------------------
    clearCache() {
        this.cache.lastFetch = null;
        logger.log('🗑️ Cache cleared');
    },

    async syncToServer() {
        const localState = localStorage.getItem('gameState');
        if (!localState) {
            console.warn('⚠️ No local state to sync');
            return false;
        }

        const state = JSON.parse(localState);
        logger.log('🔄 Syncing local state to server...');
        return await this.saveGameState(state);
    }
};

