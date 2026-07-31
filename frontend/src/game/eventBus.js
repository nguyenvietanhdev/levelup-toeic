// ===================================
// EVENT BUS - Pub/Sub Pattern
// ===================================

export const EventBus = {
    
    // Lưu trữ các event listeners
    events: {},

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {function} callback - Callback function
     * @returns {function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        
        this.events[event].push(callback);
        
        // Return unsubscribe function
        return () => this.off(event, callback);
    },

    /**
     * Subscribe to an event (one time only)
     * @param {string} event - Event name
     * @param {function} callback - Callback function
     */
    once(event, callback) {
        const onceWrapper = (...args) => {
            callback(...args);
            this.off(event, onceWrapper);
        };
        
        this.on(event, onceWrapper);
    },

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {function} callback - Callback function to remove
     */
    off(event, callback) {
        if (!this.events[event]) return;
        
        if (!callback) {
            // Remove all listeners for this event
            delete this.events[event];
            return;
        }
        
        // Remove specific callback
        this.events[event] = this.events[event].filter(cb => cb !== callback);
        
        // Clean up if no listeners left
        if (this.events[event].length === 0) {
            delete this.events[event];
        }
    },

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Data to pass to callbacks
     */
    emit(event, data) {
        if (!this.events[event]) return;
        
        // Call all callbacks for this event
        this.events[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event handler for "${event}":`, error);
            }
        });
    },

    /**
     * Remove all event listeners
     */
    clear() {
        this.events = {};
    },

    /**
     * Get all event names
     */
    getEvents() {
        return Object.keys(this.events);
    },

    /**
     * Get listener count for an event
     */
    listenerCount(event) {
        return this.events[event] ? this.events[event].length : 0;
    },

    /**
     * Check if event has any listeners
     */
    hasListeners(event) {
        return this.listenerCount(event) > 0;
    }
};

// ===================================
// PREDEFINED GAME EVENTS
// ===================================

export const GameEvents = {
    // User events
    USER_LOGIN: 'user:login',
    USER_LOGOUT: 'user:logout',
    AUTH_EXPIRED: 'auth:expired',
    USER_LEVEL_UP: 'user:levelUp',
    USER_XP_GAINED: 'user:xpGained',
    
    // Energy events
    ENERGY_CHANGED: 'energy:changed',
    ENERGY_DEPLETED: 'energy:depleted',
    ENERGY_FULL: 'energy:full',
    
    // Currency events
    COINS_CHANGED: 'coins:changed',
    GEMS_CHANGED: 'gems:changed',
    
    // Quest events
    QUEST_STARTED: 'quest:started',
    QUEST_PROGRESS: 'quest:progress',
    QUEST_COMPLETED: 'quest:completed',
    QUESTS_RESET: 'quests:reset',
    QUEST_UPDATED: 'quest:updated',
    
    // Achievement events
    ACHIEVEMENT_UNLOCKED: 'achievement:unlocked',
    
    // Practice events
    PRACTICE_REQUESTED: 'practice:requested',
    TOPIC_MODAL_REQUESTED: 'topic:modalRequested',
    SESSION_BADGE_UPDATED: 'session:badgeUpdated',
    PRACTICE_STARTED: 'practice:started',
    PRACTICE_QUESTION_ANSWERED: 'practice:questionAnswered',
    PRACTICE_COMPLETED: 'practice:completed',
    PRACTICE_EXITED: 'practice:exited',
    QUESTION_RENDERED: 'practice:questionRendered',
    HINT_USED: 'practice:hintUsed',
    QUESTION_SKIPPED: 'practice:questionSkipped',
    
    // TOEIC: khoá thanh tìm kiếm khi đang làm Full Test (mini/đục lỗ không khoá)
    TOEIC_SEARCH_LOCK: 'toeic:searchLock',

    // Game mode events
    MODE_SELECTED: 'mode:selected',
    MODE_COMPLETED: 'mode:completed',
    
    // Score events
    SCORE_UPDATED: 'score:updated',
    HIGH_SCORE: 'score:highScore',
    
    // Streak events
    STREAK_UPDATED: 'streak:updated',
    STREAK_BROKEN: 'streak:broken',
    STREAK_PROTECTED: 'streak:protected',
    
    // Shop events
    ITEM_PURCHASED: 'shop:itemPurchased',
    PURCHASE_FAILED: 'shop:purchaseFailed',
    
    // UI events
    SCREEN_CHANGED: 'ui:screenChanged',
    MODAL_OPENED: 'ui:modalOpened',
    MODAL_CLOSED: 'ui:modalClosed',
    NOTIFICATION_SHOWN: 'ui:notificationShown',
    
    // Sound events
    SOUND_PLAY: 'sound:play',
    SOUND_MUTED: 'sound:muted',
    SOUND_UNMUTED: 'sound:unmuted',
    
    // Data events
    DATA_LOADED: 'data:loaded',
    DATA_SAVED: 'data:saved',
    DATA_ERROR: 'data:error',
    
    // Vocabulary events
    WORD_LEARNED: 'vocabulary:wordLearned',
    WORD_MASTERED: 'vocabulary:wordMastered',
    
    // Timer events
    TIMER_STARTED: 'timer:started',
    TIMER_TICK: 'timer:tick',
    TIMER_ENDED: 'timer:ended',
    
    // Boost events
    BOOST_ACTIVATED: 'boost:activated',
    BOOST_EXPIRED: 'boost:expired',
    
    // Game events
    GAME_INITIALIZED: 'game:initialized',
    GAME_READY: 'game:ready',
    GAME_PAUSED: 'game:paused',
    GAME_RESUMED: 'game:resumed',
    GAME_RESET: 'game:reset',

    // Canonical "GameState was mutated, React should re-read" signal.
    // Emit via GameState.commit() instead of calling syncFromState() by hand.
    STATE_CHANGED: 'state:changed'
};

