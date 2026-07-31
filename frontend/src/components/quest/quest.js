import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { QuestsAPI } from '@api/quests.js';

export const Quest = {
    _cache: {},
    _timerId: null,
    // Các loại đã đổi progress nhưng chưa sync lên server (debounce 3s).
    // Khi claim phải flush trước, kẻo backend vẫn thấy progress cũ → 400.
    _pendingTypes: new Set(),

    init() {
        EventBus.on(GameEvents.QUEST_PROGRESS, () => EventBus.emit(GameEvents.QUEST_UPDATED, { type: 'daily' }));
        EventBus.on(GameEvents.QUESTS_RESET,   () => { this._cache = {}; this.loadType('daily'); });

        // State.js không import được Quest (vòng tròn) nên trước đây dùng
        // `if (typeof Quest !== 'undefined')` — luôn false trong ES module
        // scope → 'learn-words' và 'daily-streak' không bao giờ tick.
        // Sửa: lắng nghe EventBus tại đây.
        EventBus.on(GameEvents.WORD_LEARNED,    () => this.updateProgress('learn-words', 1));
        EventBus.on(GameEvents.STREAK_UPDATED,  () => this.updateProgress('daily-streak', 1));
        EventBus.on(GameEvents.STREAK_PROTECTED, () => this.updateProgress('daily-streak', 1));
        EventBus.on(GameEvents.STREAK_BROKEN,   () => this.updateProgress('daily-streak', 1));

        EventBus.on(GameEvents.SCREEN_CHANGED, ({ screen }) => {
            if (screen === 'quest-screen') {
                const active = 'daily';
                if (!this._cache[active]) this.loadType(active);
                else EventBus.emit(GameEvents.QUEST_UPDATED, { type: active });
            }
        });
        // Nạp đủ 4 loại quest ngay từ đầu để updateProgress có thể tăng
        // tiến độ cho cả weekly/monthly/special, không phải đợi user mở tab.
        Promise.all([
            this.loadType('daily'),
            this.loadType('weekly'),
            this.loadType('monthly'),
            this.loadType('special'),
        ]).catch(() => {});
        this.startTimer();
    },

    _getToken() {
        try {
            const raw = localStorage.getItem('authToken');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed.token || raw;
        } catch { return localStorage.getItem('authToken'); }
    },

    async loadType(type = 'daily') {
        const token = this._getToken();
        if (!token) return this._loadGuest(type);

        try {
            const res = await QuestsAPI.listRaw(type);
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            this._cache[type] = data.data;
        } catch (err) {
            console.warn('[Quest] server load failed, using guest fallback', err.message);
            this._loadGuest(type);
        }
        EventBus.emit(GameEvents.QUEST_UPDATED, { type });
        return this._cache[type];
    },

    _loadGuest(type) {
        if (type !== 'daily') { this._cache[type] = { quests: [], nextReset: null }; return; }
        const templates = (Config.dailyQuestsTemplates || []).map((t, i) => ({
            code:        t.id || `guest_${i}`,
            name:        t.name,
            description: t.description || '',
            icon:        t.icon || '🎯',
            mode:        t.mode || 'any',
            metric:      t.type || '',
            target:      t.target,
            rewardCoins: t.reward?.coins || 0,
            rewardXp:    t.reward?.xp    || 0,
            rewardGems:  t.reward?.gems  || 0,
            progress:    GameState.state.quests?.daily?.find(q => q.id === t.id)?.progress || 0,
            completed:   false,
            claimedAt:   null,
        }));
        const selected = templates.slice(0, 3);
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0);
        this._cache['daily'] = { quests: selected, nextReset: tomorrow.toISOString() };
    },

    getQuests(type = 'daily') {
        return this._cache[type]?.quests || [];
    },

    getNextReset(type = 'daily') {
        return this._cache[type]?.nextReset || null;
    },

    async syncProgress(type = 'daily', updates) {
        const token = this._getToken();
        if (!token || !updates?.length) return;
        try {
            const res = await QuestsAPI.syncRaw({ type, updates });
            const data = await res.json();
            if (data.success && this._cache[type]) {
                this._cache[type].quests = data.data.quests;
                EventBus.emit(GameEvents.QUEST_UPDATED, { type });
            }
        } catch (err) {
            console.warn('[Quest] syncProgress failed', err.message);
        }
    },

    updateProgress(progressType, amount = 1, mode = null) {
        const changedTypes = new Set();
        let anyCompleted = false;

        // Quét cache TẤT CẢ loại quest (daily/weekly/monthly/special) —
        // trước đây chỉ daily nên weekly/monthly/special không bao giờ tăng.
        for (const [type, cached] of Object.entries(this._cache || {})) {
            const quests = cached?.quests || [];
            for (const q of quests) {
                if (q.completed) continue;
                // Ưu tiên `metric` (chuẩn hoá mới); nếu trống thì suy theo
                // tiền tố `code` cũ để không vỡ quest đã seed/đang chạy.
                const metricMatch = q.metric
                    ? q.metric === progressType
                    : this._matchesType(q.code, progressType);
                const matches =
                    (q.mode === 'any' || q.mode === mode) && metricMatch;
                if (!matches) continue;

                q.progress = Math.min(q.target, q.progress + amount);
                changedTypes.add(type);

                if (q.progress >= q.target && !q.completed) {
                    q.completed = true;
                    q.completedAt = new Date().toISOString();
                    anyCompleted = true;
                    EventBus.emit(GameEvents.QUEST_COMPLETED, q);
                }
            }
        }

        if (changedTypes.size === 0) return;

        for (const type of changedTypes) {
            this._pendingTypes.add(type);
            EventBus.emit(GameEvents.QUEST_UPDATED, { type });
        }
        clearTimeout(this._syncTimeout);

        if (anyCompleted) {
            // Có quest VỪA hoàn thành → flush ngay, đừng đợi 3s, kẻo user
            // bấm "Nhận thưởng" trước khi backend kịp biết → 400.
            this._flushSync();
        } else {
            this._syncTimeout = setTimeout(() => this._flushSync(), 3000);
        }
    },

    async _flushSync() {
        if (this._pendingTypes.size === 0) return;
        const types = [...this._pendingTypes];
        this._pendingTypes.clear();
        for (const t of types) {
            const updates = (this._cache[t]?.quests || [])
                .map(q => ({ code: q.code, value: q.progress }));
            if (updates.length) await this.syncProgress(t, updates);
        }
    },

    _matchesType(code, progressType) {
        const map = {
            'complete-games':  ['daily_complete_games', 'weekly_play_sessions'],
            'correct-answers': ['daily_correct_answers'],
            'learn-words':     ['daily_learn_words', 'weekly_learn_words', 'monthly_learn_words'],
            'earn-xp':         ['daily_earn_xp'],
            'daily-streak':    ['daily_streak', 'weekly_streak'],
            'perfect-rounds':  ['daily_perfect_rounds', 'monthly_perfect_games'],
            'play-mode':       ['daily_speed_quiz'],
        };
        return (map[progressType] || []).includes(code);
    },

    async claimReward(type, code) {
        const token = this._getToken();
        if (!token) return null;

        // Bảo đảm backend đã có UserStats + quest progress mới nhất trước khi claim.
        // GameState.save() có debounce 100ms — bypass bằng _performSave() trực tiếp
        // để evaluator server đọc đúng số liệu khi refreshDoc chạy trong claimReward.
        if (GameState._saveTimeout) {
            clearTimeout(GameState._saveTimeout);
            GameState._saveTimeout = null;
        }
        if (!GameState._isSaving && GameState._performSave) {
            try { await GameState._performSave(); } catch (_) {}
        }
        clearTimeout(this._syncTimeout);
        await this._flushSync();

        try {
            const res = await QuestsAPI.claimRaw({ type, code });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);

            const q = this.getQuests(type).find(q => q.code === code);
            if (q) q.claimedAt = new Date().toISOString();

            EventBus.emit(GameEvents.QUEST_UPDATED, { type });
            return data.rewards;
        } catch (err) {
            console.warn('[Quest] claimReward failed', err.message);
            return null;
        }
    },

    startTimer() {
        clearInterval(this._timerId);
        this._timerId = setInterval(() => {
            EventBus.emit('quest:timerUpdate', {});
            // Khi một type hết period (timer về 0) → xoá cache và reload để
            // lấy doc mới từ server (progress reset về 0 cho period mới).
            for (const type of ['daily', 'weekly', 'monthly', 'special']) {
                const nextReset = this.getNextReset(type);
                if (nextReset && this._cache[type] && this.getTimeUntilReset(type) === 0) {
                    delete this._cache[type];
                    this.loadType(type);
                }
            }
        }, 1000);
    },

    getTimeUntilReset(type = 'daily') {
        const nextReset = this.getNextReset(type);
        if (!nextReset) return 0;
        return Math.max(0, Math.floor((new Date(nextReset) - Date.now()) / 1000));
    },

    getDailyQuests() { return this.getQuests('daily'); },
    getCompletedCount(type = 'daily') { return this.getQuests(type).filter(q => q.completed).length; },
    getTotalCount(type = 'daily') { return this.getQuests(type).length; },
};
