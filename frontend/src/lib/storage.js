// ===================================
// HYBRID STORAGE MANAGER
// ===================================

import { ServerStorage } from './serverStorage.js';
import { Utils } from './utils.js';
import { logger } from './logger.js';

export const Storage = {
    mode: 'local', // 'local' or 'server'

    /**
     * Initialize storage
     */
    async init() {
        const token = localStorage.getItem('authToken');
        if (token && token !== 'null' && token !== 'undefined') {
            this.mode = 'server';
            // No need to await this, it's a synchronous operation on localStorage
            if (ServerStorage) {
                ServerStorage.init();
            }
        } else {
            this.mode = 'local';
            await this.set('storageMode', 'LOCAL');
        }
        logger.log(`📦 Storage initialized in ${this.mode.toUpperCase()} mode.`);
    },

    /**
     * Switch to server mode
     */
    async switchToServer(token) {
        this.mode = 'server';
        if (ServerStorage) {
            ServerStorage.setToken(token);
            await this.syncToServer();
        }
    },

    setToken(token) {
        if (token instanceof Promise) {
            console.error('❌ setToken received a Promise! Did you forget await?');
            return;
        }

        this.token = token;
        localStorage.setItem('authToken', JSON.stringify({ token }));
    },

    /**
     * Switch to local mode
     */
    switchToLocal() {
        this.mode = 'local';
        if (ServerStorage) {
            ServerStorage.clearToken();
        }
    },

    /**
     * Sync local data to server
     */
    async syncToServer() {
        try {
            const localState = localStorage.getItem('gameState');
            if (localState && typeof ServerStorage !== 'undefined') {
                const state = JSON.parse(localState);
                await ServerStorage.saveGameState(state);
            }
        } catch (error) {
            console.error('Sync error:', error);
        }
    },

    /**
     * Set value
     */
    async set(key, value) {
        try {
            // ✅ DEBUG: Log what we're saving
            if (key === 'gameState') {
                logger.log('💾 Storage.set(gameState): coins =', value.resources?.coins);
                logger.log('💾 Storage.set(gameState): has success field?', !!value.success);
                logger.log('💾 Storage.set(gameState): has data field?', !!value.data);
            }

            // Always save to localStorage first as a reliable backup
            localStorage.setItem(key, JSON.stringify(value));

            // If in server mode, also save to the server
            if (this.mode === 'server' && typeof ServerStorage !== 'undefined') {
                if (key === 'gameState') {
                    // Respect autoSync setting — if disabled, only save to localStorage
                    if (value?.settings?.autoSync === false) {
                        console.info('⚙️ Auto sync disabled — saved locally only');
                        return true;
                    }
                    const success = await ServerStorage.saveGameState(value);
                    if (!success) {
                        const isGuest = value?.user?.isGuest === true;
                        const hasToken = ServerStorage.getToken();

                        if (!hasToken || isGuest) {
                            console.info('💾 Playing as guest - data saved locally only');
                        } else {
                            console.warn('⚠️ Server sync failed');
                        }
                    }
                    return success;
                }
            }
            return true;
        } catch (error) {
            console.error('Storage.set error:', error);
            try {
                // Fallback to ensure local save if server fails
                return true;
            } catch (fallbackError) {
                console.error('LocalStorage fallback error:', fallbackError);
                return false;
            }
        }
    },

    /**
     * Get value
     */
    async get(key, defaultValue = null) {
        try {
            // In server mode, always try to fetch the latest from the server for gameState
            if (key === 'gameState' && this.mode === 'server' && typeof ServerStorage !== 'undefined') {
                const state = await ServerStorage.getGameState();
                if (state) {
                    // ✅ DEBUG: Log what we got from server
                    logger.log('🌐 Storage.get(gameState) from server: coins =', state.resources?.coins);
                    logger.log('🌐 Storage.get(gameState) from server: has success?', !!state.success);

                    // Cache the server state locally
                    localStorage.setItem(key, JSON.stringify(state));
                    return state;
                }
            }
            const item = localStorage.getItem(key);
            return item === null ? defaultValue : JSON.parse(item);
        } catch (error) {
            console.error('Storage.get error:', error);
            try {
                const item = localStorage.getItem(key);
                return item === null ? defaultValue : JSON.parse(item);
            } catch (fallbackError) {
                console.error('LocalStorage fallback error:', fallbackError);
                return defaultValue;
            }
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            if (key === 'gameState' && this.mode === 'server' && typeof ServerStorage !== 'undefined') {
                ServerStorage.clearCache();
            }
            return true;
        } catch (error) {
            console.error('Storage.remove error:', error);
            return false;
        }
    },

    clear() {
        try {
            localStorage.clear();
            if (this.mode === 'server' && typeof ServerStorage !== 'undefined') {
                ServerStorage.clearCache();
            }
            return true;
        } catch (error) {
            console.error('Storage.clear error:', error);
            return false;
        }
    },

    has(key) {
        return localStorage.getItem(key) !== null;
    },

    keys() {
        return Object.keys(localStorage);
    },

    size() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        return total;
    },

    async update(key, updates) {
        try {
            const current = await this.get(key, {});
            const updated = { ...current, ...updates };
            return await this.set(key, updated);
        } catch (error) {
            console.error('Storage.update error:', error);
            return false;
        }
    },

    async deepUpdate(key, updates) {
        try {
            const current = await this.get(key, {});
            const updated = Utils.deepMerge(current, updates);
            return await this.set(key, updated);
        } catch (error) {
            console.error('Storage.deepUpdate error:', error);
            return false;
        }
    },

    async increment(key, amount = 1) {
        try {
            const current = await this.get(key, 0);
            const newValue = current + amount;
            return (await this.set(key, newValue)) ? newValue : current;
        } catch (error) {
            console.error('Storage.increment error:', error);
            return await this.get(key, 0);
        }
    },

    async decrement(key, amount = 1) {
        return await this.increment(key, -amount);
    },

    async push(key, item) {
        try {
            const array = await this.get(key, []);
            array.push(item);
            return await this.set(key, array);
        } catch (error) {
            console.error('Storage.push error:', error);
            return false;
        }
    },

    export() {
        try {
            const data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                data[key] = JSON.parse(localStorage.getItem(key));
            }
            return JSON.stringify(data, null, 2);
        } catch (error) {
            console.error('Storage.export error:', error);
            return null;
        }
    },

    isAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (error) {
            return false;
        }
    }
};

