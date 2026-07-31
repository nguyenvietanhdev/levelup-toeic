// ===================================
// GAME STATE MANAGER (FIXED - FULL ASYNC)
// ===================================

import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Storage } from '@lib/storage.js';
import { logger } from '@lib/logger.js';

// Canonical default settings — single source for both the initial state
// and "restore default settings" (avoids the two drifting apart).
export const DEFAULT_SETTINGS = {
    randomQuestions: false,
    soundEnabled: true,
    soundEffects: true,
    autoPronunciation: true,
    practiceSoundEnabled: true,
    notificationsEnabled: true,
    volume: 70,
    questionsPerSession: 'auto',
    timeLimitEnabled: true,
    timePerQuestion: 30,      // legacy: dùng chung; questionTime (theo chế độ) ưu tiên hơn
    questionTime: {},         // { [modeId]: giây } — thời gian mỗi câu theo từng chế độ
    toeicPerQuestionTimer: false, // bài thi TOEIC: đếm ngược từng câu (CHỈ Part 5·6·7 Đọc)
    toeicAutoAdvance: true,   // hết giờ một câu → tự sang câu kế (chỉ Part Đọc)
    toeicTransition: 1,       // giây nghỉ giữa hai câu (đã trừ khỏi ngân sách mỗi câu)
    // Thời gian TỔNG tùy chỉnh cho TỪNG Part Đọc (phút) — mức "Tùy chỉnh" ở popup.
    // Mỗi Part một ngân sách riêng vì độ dài mỗi câu khác nhau (P7 đọc cả đoạn).
    toeicCustomPartMin: { 5: 15, 6: 8, 7: 36 },
    difficulty: "adaptive",
    levelFilter: null,
    autoSync: true,
    soundVolume: 1.0,
    musicVolume: 0.7,
    vocabLang: 'en',
};

export const GameState = {

    _saveTimeout: null,
    _isSaving: false,
    _pendingSave: false,
    _justInitialized: false,
    _initBlockUntil: 0,

    state: {
        user: {
            id: null,
            username: 'Player',
            avatar: 'P',
            level: 1,
            xp: 0,
            totalXp: 0,
            createdAt: Date.now(),
            lastLoginAt: Date.now()
        },

        resources: {
            energy: 100,
            maxEnergy: 100,
            coins: 0,
            gems: 0,
            hints: 0,
            shields: 0,
            timeFreezes: 0,
            lastEnergyUpdate: Date.now()
        },

        progress: {
            wordsLearned: [],
            wordsMastered: [],
            wrongWords: [],
            // Ngày đã học (YYYY-MM-DD) — nguồn nhẹ cho lịch streak ở trang chủ.
            // Giữ lại qua các lần reset thống kê hàng tháng (chỉ ~10 byte/ngày).
            studiedDays: [],
            totalGamesPlayed: 0,
            totalCorrectAnswers: 0,
            totalWrongAnswers: 0,
            perfectRounds: 0,
            highestScore: 0,
            totalPlayTime: 0,
            modeStats: {
                'multiple-choice': { played: 0, score: 0, correct: 0, total: 0 },
                'fill-blank': { played: 0, score: 0, correct: 0, total: 0 },
                'listening': { played: 0, score: 0, correct: 0, total: 0 },
                'matching': { played: 0, score: 0, correct: 0, total: 0 },
                'word-scramble': { played: 0, score: 0, correct: 0, total: 0 },
                'speed-quiz': { played: 0, score: 0, correct: 0, total: 0 },
                'flashcard': { played: 0, score: 0, correct: 0, total: 0 },
                'review-mistakes': { played: 0, score: 0, correct: 0, total: 0 }
            }
        },

        streak: {
            current: 0,
            longest: 0,
            lastPlayDate: null,
            shieldsUsed: 0
        },

        quests: {
            daily: [],
            lastResetDate: null
        },

        achievements: [],

        boosts: {
            xp: { active: false, multiplier: 1, expiresAt: null },
            coins: { active: false, multiplier: 1, expiresAt: null },
            // Tăng TỐC ĐỘ hồi ⚡ (x2/x3), không cộng thẳng ⚡ — trần maxEnergy giữ nguyên.
            energy: { active: false, multiplier: 1, expiresAt: null }
        },

        // VIP (server-authoritative): active + mốc hết hạn (ms). Khi active →
        // năng lượng không trừ + x2 XP/Coins.
        vip: { active: false, expiresAt: 0 },

        // Cosmetic đang trang bị (server-authoritative): { background: itemId, ... }
        equipped: {},
        // Ảnh của cosmetic đang trang bị, server gửi từ DB: { avatar: '/uploads/...', ... }
        equippedImages: {},

        // Lịch sử chi tiêu (cap 50, newest first) — server-authoritative.
        transactions: [],

        settings: { ...DEFAULT_SETTINGS },


        session: {
            currentScreen: 'home-screen',
            practiceMode: null,
            practiceData: null,
            isPaused: false
        }
    },

    async init() {
        logger.log('🚀 Initializing GameState...');

        await Storage.init();

        const savedState = await Storage.get('gameState');

        let needsSave = false;

        if (savedState) {
            logger.log('📦 Loading saved state...');
            logger.log('🔍 DEBUG: savedState type:', typeof savedState, 'has success:', !!savedState.success, 'has data:', !!savedState.data);
            logger.log('🔍 DEBUG: savedState.resources?.coins:', savedState.resources?.coins);
            logger.log('🔍 DEBUG: savedState.data?.resources?.coins:', savedState.data?.resources?.coins);

            let cleanState = savedState;
            if (savedState.success && savedState.data) {
                logger.log('📤 Detected response wrapper, extracting data...');
                cleanState = savedState.data;
            }

            logger.log('🔍 DEBUG: cleanState.resources?.coins:', cleanState.resources?.coins);
            this.state = Utils.deepMerge(this.state, cleanState);
            // Luôn reset về Toàn bộ mỗi lần load — không giữ số câu cũ.
            this.state.settings.questionsPerSession = 'auto';

            // Normalize XP: server may store cumulative XP rather than
            // current-level XP. Shed completed level(s) so user.xp is always
            // < getXpForLevel(user.level) and the XP bar renders correctly.
            {
                const maxLv = Config.game?.maxLevel || 100;
                let needed = Utils.getXpForLevel(this.state.user.level);
                while (needed > 0 && this.state.user.xp >= needed && this.state.user.level < maxLv) {
                    this.state.user.xp -= needed;
                    this.state.user.level++;
                    needed = Utils.getXpForLevel(this.state.user.level);
                }
            }

            if (cleanState.resources?.energy !== undefined) {
                this.state.resources.lastEnergyUpdate = Date.now();
            }

            const defaultSettings = {
                practiceSoundEnabled: true,
                levelFilter: null
            };

            for (const [key, defaultValue] of Object.entries(defaultSettings)) {
                const existsInSavedState = cleanState.settings && (key in cleanState.settings);

                if (!existsInSavedState && this.state.settings[key] === undefined) {
                    this.state.settings[key] = defaultValue;
                    logger.log(`✅ Added missing setting: ${key} = ${defaultValue}`);
                    needsSave = true;
                } else if (existsInSavedState) {
                    logger.log(`✓ Setting "${key}" exists in saved state:`, cleanState.settings[key]);
                }
            }
        } else {
            logger.log('🆕 Initializing new user...');
            this.initializeNewUser();
            needsSave = true;
        }

        // The backend settingsSchema does not declare `practiceSoundEnabled`,
        // so the server silently strips it and reload would reset it to the
        // default `true`. The Settings toggle persists it to a dedicated
        // localStorage key — restore from there so it survives reload and the
        // practice engine respects it. (Frontend-only workaround.)
        try {
            const pse = localStorage.getItem('practiceSoundEnabled');
            if (pse === 'true' || pse === 'false') {
                this.state.settings.practiceSoundEnabled = (pse === 'true');
            }
        } catch { /* localStorage unavailable — keep merged value */ }

        try {
            const vocabLang = localStorage.getItem('vocabLang');
            if (vocabLang === 'en' || vocabLang === 'zh') {
                this.state.settings.vocabLang = vocabLang;
            }
        } catch { /* localStorage unavailable - keep merged value */ }

        // Các setting "critical" (timeLimitEnabled, timePerQuestion, difficulty,
        // levelFilter, questionsPerSession) được SettingsScreen lưu riêng vào
        // localStorage 'userSettings'. Một số bị backend settingsSchema strip
        // → restore từ đây để GameState (nguồn mà practice engine đọc) khớp với
        // UI Settings, tránh trường hợp tắt timer nhưng F5 lại bật.
        try {
            const userSettings = JSON.parse(localStorage.getItem('userSettings') || '{}');
            Object.assign(this.state.settings, userSettings);
        } catch { /* localStorage unavailable - keep merged value */ }

        this.state.user.lastLoginAt = Date.now();

        const oldEnergy = this.state.resources.energy;
        const oldStreak = this.state.streak.current;

        // Streak chỉ được tick khi user thực sự hoàn thành 1 chế độ
        // (backend /practice/submit lo việc cộng streak). KHÔNG tick chỉ
        // do mở app, kẻo user vào web rồi out cũng tăng — sai semantics.
        this.regenerateEnergy();
        this.updateBoosts();
        this.checkDailyQuestsReset();
        if (this._monthlyStatsMaintenance()) needsSave = true;

        if (this.state.achievements.length === 0 && !navigator.onLine) {
            logger.log('📡 Offline: initializing achievements from config...');
            this.initializeAchievements();
            needsSave = true;
        }

        if (this.state.resources.energy !== oldEnergy || this.state.streak.current !== oldStreak) {
            needsSave = true;
        }

        logger.log('⏭️ Skipping initial save to preserve server data');
        needsSave = false;

        this._justInitialized = true;
        this._initBlockUntil = Date.now() + 5000;
        logger.log('🔒 Save operations BLOCKED for 5 seconds after init');

        setTimeout(() => {
            this._justInitialized = false;
            logger.log('🔓 Save operations UNBLOCKED - auto-save can now proceed normally');
        }, 5000);

        EventBus.emit(GameEvents.GAME_INITIALIZED, this.state);
        logger.log('✅ GameState initialized successfully');
    },

    /**
     * Reset thống kê theo tháng: lúc sang tháng mới (0h ngày mùng 1), dữ liệu
     * practiceHistory của các tháng trước bị xoá để giữ blob nhẹ. Trước khi xoá,
     * các ngày đã học được lưu vào progress.studiedDays (siêu nhẹ) để lịch streak
     * vẫn hiển thị được lịch sử. Chạy mỗi lần init → tự reset khi mở app sang tháng.
     * @returns {boolean} true nếu có thay đổi (caller nên save).
     */
    _monthlyStatsMaintenance() {
        const p = this.state.progress;
        if (!p) return false;
        if (!Array.isArray(p.studiedDays)) p.studiedDays = [];
        const hist = Array.isArray(this.state.practiceHistory) ? this.state.practiceHistory : [];

        // Backfill: gộp mọi ngày trong practiceHistory vào studiedDays (dedup).
        const studied = new Set(p.studiedDays);
        const before = studied.size;
        for (const e of hist) { if (e?.date) studied.add(e.date); }

        // Prune: chỉ giữ entry của tháng hiện tại (YYYY-MM theo giờ địa phương).
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const kept = hist.filter(e => (e?.date || '').startsWith(monthKey));

        let changed = false;
        if (studied.size !== before) { p.studiedDays = Array.from(studied).sort(); changed = true; }
        if (kept.length !== hist.length) { this.state.practiceHistory = kept; changed = true; }
        return changed;
    },

    initializeNewUser() {
        this.state.user.id = Utils.generateId();
        this.state.user.createdAt = Date.now();
        this.generateDailyQuests();
    },

    initializeAchievements() {
        this.state.achievements = Config.achievements.map(a => ({
            ...a,
            unlocked: false,
            unlockedAt: null
        }));
    },

    async save() {
        if (this._justInitialized || Date.now() < this._initBlockUntil) {
            const timeRemaining = Math.ceil((this._initBlockUntil - Date.now()) / 1000);
            // Not an error — intentional guard so a stray save() right after init
            // can't overwrite fresh server data. Logged at info level on purpose.
            logger.log(`⏭️ Save skipped (post-init guard, ${timeRemaining}s left) — server data preserved.`);
            return false;
        }

        if (this._saveTimeout) {
            clearTimeout(this._saveTimeout);
        }

        if (this._isSaving) {
            this._pendingSave = true;
            logger.log('⏳ Save in progress, will retry after completion...');
            return;
        }

        this._saveTimeout = setTimeout(async () => {
            await this._performSave();
        }, 100);
    },

    async _performSave() {
        try {
            this._isSaving = true;
            this._pendingSave = false;

            const cleanState = { ...this.state };
            delete cleanState.success;
            delete cleanState.data;

            logger.log('💾 GameState._performSave() - About to save:');
            logger.log('   cleanState.resources.coins:', cleanState.resources?.coins);
            logger.log('   cleanState.resources.gems:', cleanState.resources?.gems);
            logger.log('   cleanState.user.level:', cleanState.user?.level);

            await Storage.set('gameState', cleanState);
            EventBus.emit(GameEvents.DATA_SAVED, cleanState);

            this._isSaving = false;

            if (this._pendingSave) {
                logger.log('🔁 Performing pending save...');
                this._pendingSave = false;
                await this._performSave();
            }
        } catch (error) {
            console.error('❌ Failed to save state:', error);
            EventBus.emit(GameEvents.SAVE_FAILED, error);
            this._isSaving = false;
        }
    },

    /**
     * Signal that GameState was mutated so the React layer re-reads it.
     * Use this ONE call instead of importing/calling syncFromState() by hand
     * after a direct GameState mutation (that pattern caused stale-UI bugs).
     * Pure notification — does not persist (call save() separately if needed).
     */
    commit() {
        EventBus.emit(GameEvents.STATE_CHANGED);
    },

    /** Restore settings (only) to their canonical defaults + persist. */
    async resetSettings() {
        this.state.settings = { ...DEFAULT_SETTINGS };
        await this.save?.();
    },

    getState() {
        return Utils.deepClone(this.state);
    },

    getUser() {
        return { ...this.state.user };
    },

    setUser(user) {
        this.state.user = { ...this.state.user, ...user };
    },

    async updateUser(updates) {
        this.state.user = { ...this.state.user, ...updates };
        await this.save();
    },

    getResources() {
        return { ...this.state.resources };
    },

    async addXp(amount, skipSave = false) {
        let multiplier = this.state.boosts.xp.active ? this.state.boosts.xp.multiplier : 1;

        if (this.isVIPActive()) {
            multiplier *= 2;
        }

        const actualAmount = Math.floor(amount * multiplier);

        this.state.user.xp += actualAmount;
        this.state.user.totalXp += actualAmount;

        EventBus.emit(GameEvents.USER_XP_GAINED, { amount: actualAmount, multiplier });

        await this.checkLevelUp();

        if (!skipSave) {
            await this.save();
        }

        return actualAmount;
    },

    async checkLevelUp() {
        const maxLevel = Config.game?.maxLevel || 100;

        if (this.state.user.level >= maxLevel) {
            return;
        }

        const xpNeeded = Utils.getXpForLevel(this.state.user.level);

        if (xpNeeded === 0) {
            return;
        }

        if (this.state.user.xp >= xpNeeded) {
            this.state.user.xp -= xpNeeded;
            this.state.user.level++;

            if (this.state.user.level > maxLevel) {
                this.state.user.level = maxLevel;
            }

            const coinsReward = Config.coinsRewards.levelUp;
            const gemsReward = Math.floor(this.state.user.level / 2);

            const isPracticing = this.state.session?.currentScreen === 'practice-screen';
            await this.addCoins(coinsReward, isPracticing);
            await this.addGems(gemsReward, isPracticing);

            EventBus.emit(GameEvents.USER_LEVEL_UP, {
                level: this.state.user.level,
                coinsReward,
                gemsReward,
                isMaxLevel: this.state.user.level >= maxLevel
            });

            this.checkAchievements();

            if (!isPracticing) {
                await this.save();
            }
        }
    },

    async addEnergy(amount) {
        const before = this.state.resources.energy;
        this.state.resources.energy = Math.min(
            this.state.resources.energy + amount,
            this.state.resources.maxEnergy
        );
        const added = this.state.resources.energy - before;

        if (added > 0) {
            EventBus.emit(GameEvents.ENERGY_CHANGED, {
                current: this.state.resources.energy,
                max: this.state.resources.maxEnergy,
                added
            });
        }

        return added;
    },

    async useEnergy(amount) {
        // VIP còn hạn → năng lượng KHÔNG bị trừ (đúng mô tả "Unlimited energy").
        if (this.isVipActive()) {
            return true;
        }

        if (this.state.resources.energy < amount) {
            EventBus.emit(GameEvents.ENERGY_DEPLETED);
            return false;
        }

        this.state.resources.energy -= amount;

        EventBus.emit(GameEvents.ENERGY_CHANGED, {
            current: this.state.resources.energy,
            max: this.state.resources.maxEnergy,
            used: amount
        });

        return true;
    },

    isVipActive() {
        const vip = this.state.vip;
        return !!(vip?.active && vip.expiresAt && Date.now() < vip.expiresAt);
    },

    /**
     * ⚡ hồi mỗi phút, đã tính thẻ tăng tốc. Một chỗ duy nhất để mọi nơi
     * (vòng lặp game, heartbeat, đồng hồ đếm ngược) ra cùng con số — lệch nhau
     * là client ghi đè mất phần server đã cộng.
     */
    energyRegenPerMinute() {
        const b = this.state.boosts?.energy;
        const alive = b?.active && (!b.expiresAt || Date.now() < new Date(b.expiresAt).getTime());
        return alive ? Math.max(1, b.multiplier || 1) : 1;
    },

    async regenerateEnergy() {
        const now = Date.now();
        const lastUpdate = this.state.resources.lastEnergyUpdate;
        const minutesPassed = Math.floor((now - lastUpdate) / 60000);

        if (minutesPassed > 0 && this.state.resources.energy < this.state.resources.maxEnergy) {
            const gain = minutesPassed * this.energyRegenPerMinute();
            logger.log(`⚡ Regenerating ${gain} energy...`);

            await this.addEnergy(gain);
            this.state.resources.lastEnergyUpdate = now;
        }
    },

    async addCoins(amount, skipSave = false) {
        let multiplier = this.state.boosts.coins.active ? this.state.boosts.coins.multiplier : 1;

        if (this.isVIPActive()) {
            multiplier *= 2;
        }

        const actualAmount = Math.floor(amount * multiplier);
        this.state.resources.coins += actualAmount;

        EventBus.emit(GameEvents.COINS_CHANGED, {
            amount: this.state.resources.coins,
            added: actualAmount
        });

        if (!skipSave) {
            await this.save();
        }

        return actualAmount;
    },

    async useCoins(amount) {
        if (this.state.resources.coins < amount) return false;

        this.state.resources.coins -= amount;

        EventBus.emit(GameEvents.COINS_CHANGED, {
            amount: this.state.resources.coins,
            used: amount
        });

        await this.save();

        return true;
    },

    async addGems(amount, skipSave = false) {
        this.state.resources.gems += amount;

        EventBus.emit(GameEvents.GEMS_CHANGED, {
            amount: this.state.resources.gems,
            added: amount
        });

        if (!skipSave) {
            await this.save();
        }
    },

    /**
     * Cộng thẳng phần thưởng đã do BACKEND tính (claim quest/achievement…).
     * Không áp boost / VIP multiplier (server đã quyết net amount), không
     * gọi save (server đã ghi DB). Chỉ cập nhật state cục bộ + phát event
     * để React (header coins/gems/XP) reflect ngay, khỏi phải F5.
     */
    creditServerRewards({ coins = 0, xp = 0, gems = 0 } = {}) {
        if (coins) {
            this.state.resources.coins += coins;
            EventBus.emit(GameEvents.COINS_CHANGED, {
                amount: this.state.resources.coins, added: coins,
            });
        }
        if (gems) {
            this.state.resources.gems += gems;
            EventBus.emit(GameEvents.GEMS_CHANGED, {
                amount: this.state.resources.gems, added: gems,
            });
        }
        if (xp) {
            this.state.user.xp += xp;
            this.state.user.totalXp = (this.state.user.totalXp || 0) + xp;
            EventBus.emit(GameEvents.USER_XP_GAINED, { amount: xp, multiplier: 1 });
            this.checkLevelUp().catch(() => {});
        }
    },

    async useGems(amount) {
        if (this.state.resources.gems < amount) return false;

        this.state.resources.gems -= amount;

        EventBus.emit(GameEvents.GEMS_CHANGED, {
            amount: this.state.resources.gems,
            used: amount
        });

        await this.save();

        return true;
    },

    async updateStreak() {
        const today = Utils.getStartOfDay();
        const lastPlay = this.state.streak.lastPlayDate;

        if (!lastPlay) {
            this.state.streak.current = 1;
            this.state.streak.lastPlayDate = today;
            EventBus.emit(GameEvents.STREAK_UPDATED, this.state.streak);
            return;
        }

        const lastPlayDay = Utils.getStartOfDay(lastPlay);
        const daysDiff = Math.floor((today - lastPlayDay) / 86400000);

        if (daysDiff === 0) {
            // Đã chơi hôm nay rồi. Nhưng nếu current = 0 (data cũ bị lỗi),
            // thì việc chơi hôm nay nghĩa là streak phải >= 1 → sửa lại.
            if (this.state.streak.current < 1) {
                this.state.streak.current = 1;
                if (this.state.streak.current > this.state.streak.longest) {
                    this.state.streak.longest = this.state.streak.current;
                }
                EventBus.emit(GameEvents.STREAK_UPDATED, this.state.streak);
            }
            return;
        } else if (daysDiff === 1) {
            this.state.streak.current++;
            this.state.streak.lastPlayDate = today;

            if (this.state.streak.current > this.state.streak.longest) {
                this.state.streak.longest = this.state.streak.current;
            }

            EventBus.emit(GameEvents.STREAK_UPDATED, this.state.streak);
            this.checkAchievements();
        } else {
            if (this.state.resources.shields > 0) {
                this.state.resources.shields--;
                this.state.streak.shieldsUsed++;
                this.state.streak.lastPlayDate = today;
                EventBus.emit(GameEvents.STREAK_PROTECTED, this.state.streak);
            } else {
                this.state.streak.current = 1;
                this.state.streak.lastPlayDate = today;
                EventBus.emit(GameEvents.STREAK_BROKEN);
            }
        }
    },

    generateDailyQuests() {
        const templates = Utils.shuffleArray([...Config.dailyQuestsTemplates]);
        const selected = templates.slice(0, 3);

        this.state.quests.daily = selected.map(q => ({
            ...Utils.deepClone(q),
            id: Utils.generateId(),
            progress: 0,
            completed: false
        }));

        this.state.quests.lastResetDate = Utils.getStartOfDay();
        this.save();
    },

    checkDailyQuestsReset() {
        const today = Utils.getStartOfDay();
        const lastReset = this.state.quests.lastResetDate;

        if (!lastReset || today > lastReset) {
            this.generateDailyQuests();
            EventBus.emit(GameEvents.QUESTS_RESET);
        }
    },

    async updateQuestProgress(type, amount = 1, mode = null) {
        let updated = false;

        this.state.quests.daily.forEach(quest => {
            if (quest.completed) return;
            if (quest.type === type) {
                if (quest.mode && quest.mode !== mode) return;

                quest.progress += amount;

                if (quest.progress >= quest.target) {
                    quest.progress = quest.target;
                    quest.completed = true;

                    if (quest.reward.coins) this.addCoins(quest.reward.coins);
                    if (quest.reward.xp) this.addXp(quest.reward.xp);
                    if (quest.reward.gems) this.addGems(quest.reward.gems);

                    EventBus.emit(GameEvents.QUEST_COMPLETED, quest);
                } else {
                    EventBus.emit(GameEvents.QUEST_PROGRESS, quest);
                }

                updated = true;
            }
        });

        if (updated) {
            await this.save();
        }
    },

    checkAchievements() {
        if (typeof AchievementsUI !== 'undefined') {
            AchievementsUI.loadAchievements();
        }
    },

    updateBoosts() {
        const now = Date.now();
        let updated = false;

        Object.keys(this.state.boosts).forEach(type => {
            const boost = this.state.boosts[type];

            if (boost.active && boost.expiresAt && now >= boost.expiresAt) {
                boost.active = false;
                boost.multiplier = 1;
                boost.expiresAt = null;

                EventBus.emit(GameEvents.BOOST_EXPIRED, { type });
                updated = true;
            }
        });

        if (updated) {
            this.save();
        }
    },

    async activateBoost(type, multiplier, duration) {
        this.state.boosts[type] = {
            active: true,
            multiplier,
            expiresAt: Date.now() + duration * 1000
        };

        EventBus.emit(GameEvents.BOOST_ACTIVATED, { type, multiplier, duration });
        await this.save();
    },

    async learnWord(wordId) {
        if (!this.state.progress.wordsLearned.includes(wordId)) {
            this.state.progress.wordsLearned.push(wordId);

            EventBus.emit(GameEvents.WORD_LEARNED, { wordId });
            this.checkAchievements();
        }
    },

    addWrongWord(word) {
        if (!word || !word.id) return;

        const existingIndex = this.state.progress.wrongWords.findIndex(w => w.id === word.id);

        if (existingIndex !== -1) {
            this.state.progress.wrongWords[existingIndex].wrongCount =
                (this.state.progress.wrongWords[existingIndex].wrongCount || 1) + 1;
            this.state.progress.wrongWords[existingIndex].lastWrongAt = Date.now();
        } else {
            this.state.progress.wrongWords.push({
                ...word,
                wrongCount: 1,
                lastWrongAt: Date.now()
            });
        }

        if (this.state.progress.wrongWords.length > 100) {
            this.state.progress.wrongWords.sort((a, b) => b.lastWrongAt - a.lastWrongAt);
            this.state.progress.wrongWords = this.state.progress.wrongWords.slice(0, 100);
        }
    },

    removeWrongWord(wordId) {
        const index = this.state.progress.wrongWords.findIndex(w => w.id === wordId);
        if (index !== -1) {
            this.state.progress.wrongWords.splice(index, 1);
        }
    },

    getWrongWords() {
        return this.state.progress.wrongWords || [];
    },

    clearWrongWords() {
        this.state.progress.wrongWords = [];
    },

    isVIPActive() {
        const vip = this.state.vip;
        if (!vip || !vip.active) return false;

        if (Date.now() > vip.expiresAt) {
            this.state.vip.active = false;
            this.save();
            return false;
        }

        return true;
    },

    getStatistics() {
        const total = this.state.progress.totalCorrectAnswers + this.state.progress.totalWrongAnswers;
        const accuracy = total > 0 ? Utils.percentage(this.state.progress.totalCorrectAnswers, total) : 0;

        return {
            wordsLearned: this.state.progress.wordsLearned.length,
            totalGamesPlayed: this.state.progress.totalGamesPlayed,
            accuracy,
            highestScore: this.state.progress.highestScore,
            perfectRounds: this.state.progress.perfectRounds,
            streak: this.state.streak.current,
            longestStreak: this.state.streak.longest,
            level: this.state.user.level,
            totalPlayTime: this.state.progress.totalPlayTime
        };
    },

    resetToGuest() {
        this.state.user = {
            id: null,
            username: "Player",
            avatar: "P",
            level: 1,
            xp: 0,
            totalXp: 0,
            createdAt: Date.now(),
            lastLoginAt: Date.now()
        };
    },

    async reset() {
        // Wipe in-memory progress so deepMerge in init() doesn't preserve
        // stale keys (e.g. favoriteWords) that the server response omits.
        Object.assign(this.state.progress, {
            wordsLearned: [], wordsMastered: [], favoriteWords: [],
            wrongWords: [], totalGamesPlayed: 0, totalCorrectAnswers: 0,
            totalWrongAnswers: 0, perfectRounds: 0, highestScore: 0,
            totalPlayTime: 0, modeStats: {},
        });
        this.state.resources = { energy: 100, maxEnergy: 100, coins: 0, gems: 0, hints: 0, shields: 0, timeFreezes: 0, lastEnergyUpdate: Date.now() };
        this.state.streak = { current: 0, longest: 0, lastPlayDate: null, shieldsUsed: 0 };
        this.state.achievements = [];
        this.state.practiceHistory = [];
        this.state.user.level = 1;
        this.state.user.xp = 0;
        this.state.user.totalXp = 0;

        await Storage.remove('gameState');
        await this.init();
        EventBus.emit(GameEvents.GAME_RESET);
    },

    applyServerState(serverData) {
        if (!serverData) return;

        if (serverData.user) {
            this.state.user = { ...this.state.user, ...serverData.user };
        }

        if (serverData.resources) {
            this.state.resources = { ...this.state.resources, ...serverData.resources };
        }

        if (serverData.progress) {
            this.state.progress = Utils.deepMerge(this.state.progress, serverData.progress);
        }

        if (serverData.streak) {
            this.state.streak = { ...this.state.streak, ...serverData.streak };
        }

        if (serverData.quests) {
            this.state.quests = Utils.deepMerge(this.state.quests, serverData.quests);
        }

        if (serverData.achievements) {
            this.state.achievements = serverData.achievements;
        }

        if (serverData.boosts) {
            this.state.boosts = Utils.deepMerge(this.state.boosts, serverData.boosts);
        }

        // Cosmetic đang trang bị + ảnh của chúng (server gửi từ DB).
        // Thiếu 2 dòng này thì sau F5 avatar/khung/nền mất, rơi về chữ cái đầu.
        if (serverData.equipped) {
            this.state.equipped = { ...serverData.equipped };
        }
        if (serverData.equippedImages) {
            this.state.equippedImages = { ...serverData.equippedImages };
        }
    }

};
