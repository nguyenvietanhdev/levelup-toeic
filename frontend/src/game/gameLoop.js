import { GameState } from './state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { logger } from '@lib/logger.js';

export const GameLoop = {

    timers: {},
    animationFrameId: null,
    updateCallbacks: [],
    isRunning: false,
    lastTime: 0,

    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.lastTime = performance.now();
        this.loop();
    },

    stop() {
        this.isRunning = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    },

    loop(currentTime = 0) {
        if (!this.isRunning) return;

        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.updateCallbacks.forEach(callback => {
            try {
                callback(deltaTime);
            } catch (error) {
                console.error('Update callback error:', error);
            }
        });

        this.updateTimers(deltaTime);

        this.animationFrameId = requestAnimationFrame((time) => this.loop(time));
    },

    onUpdate(callback) {
        this.updateCallbacks.push(callback);

        return () => {
            this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
        };
    },

    updateTimers(deltaTime) {
        Object.keys(this.timers).forEach(id => {
            const timer = this.timers[id];

            if (timer.paused) return;

            timer.elapsed += deltaTime / 1000;

            if (timer.countdown) {
                timer.remaining = Math.max(0, timer.duration - timer.elapsed);
            } else {
                timer.remaining = timer.elapsed;
            }

            if (timer.onTick) {
                timer.onTick(timer.remaining, timer.elapsed);
            }

            if (timer.countdown && timer.remaining <= 0) {
                if (timer.onComplete) {
                    timer.onComplete();
                }
                this.removeTimer(id);
            }
        });
    },

    createTimer(id, options = {}) {
        const timer = {
            id: id,
            duration: options.duration || 0,
            countdown: options.countdown !== false,
            elapsed: 0,
            remaining: options.countdown !== false ? options.duration : 0,
            paused: false,
            onTick: options.onTick || null,
            onComplete: options.onComplete || null,
            onPause: options.onPause || null,
            onResume: options.onResume || null
        };

        this.timers[id] = timer;

        EventBus.emit(GameEvents.TIMER_STARTED, { id, duration: timer.duration });

        return timer;
    },

    removeTimer(id) {
        if (this.timers[id]) {
            delete this.timers[id];
            EventBus.emit(GameEvents.TIMER_ENDED, { id });
        }
    },

    pauseTimer(id) {
        const timer = this.timers[id];
        if (timer && !timer.paused) {
            timer.paused = true;
            if (timer.onPause) {
                timer.onPause();
            }
        }
    },

    resumeTimer(id) {
        const timer = this.timers[id];
        if (timer && timer.paused) {
            timer.paused = false;
            if (timer.onResume) {
                timer.onResume();
            }
        }
    },

    getTimer(id) {
        return this.timers[id];
    },

    getTimerRemaining(id) {
        const timer = this.timers[id];
        return timer ? timer.remaining : 0;
    },

    hasTimer(id) {
        return !!this.timers[id];
    },

    clearTimers() {
        Object.keys(this.timers).forEach(id => {
            this.removeTimer(id);
        });
    }
};

export const EnergySystem = {

    regenIntervalId: null,

    startRegeneration() {
        if (this.regenIntervalId) return;

        this.regenIntervalId = setInterval(() => {
            this.regenerateEnergy();
        }, Config.game.energyRegenInterval);

        logger.log('Energy regeneration started');
    },

    stopRegeneration() {
        if (this.regenIntervalId) {
            clearInterval(this.regenIntervalId);
            this.regenIntervalId = null;
        }
    },

    regenerateEnergy() {
        const resources = GameState.getResources();

        if (resources.energy < resources.maxEnergy) {
            GameState.addEnergy(Config.game.energyRegenRate * GameState.energyRegenPerMinute());

            if (resources.energy >= resources.maxEnergy) {
                EventBus.emit(GameEvents.ENERGY_FULL);
            }
        }
    }
};

export const DailyQuestTimer = {

    checkIntervalId: null,

    start() {
        if (this.checkIntervalId) return;

        this.checkIntervalId = setInterval(() => {
            this.checkReset();
        }, 60000);

        this.checkReset();
    },

    stop() {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }
    },

    checkReset() {
        GameState.checkDailyQuestsReset();
    },

    getTimeUntilReset() {
        return Utils.getTimeUntilMidnight();
    }
};

export const BoostChecker = {

    checkIntervalId: null,

    start() {
        if (this.checkIntervalId) return;

        this.checkIntervalId = setInterval(() => {
            this.checkBoosts();
        }, 1000);
    },

    stop() {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }
    },

    checkBoosts() {
        GameState.updateBoosts();
    }
};

export const AutoSave = {

    saveIntervalId: null,

    start() {
        if (this.saveIntervalId) return;

        this.saveIntervalId = setInterval(() => {
            this.save();
        }, Config.ui.autoSaveInterval);

        logger.log('Auto-save started');
    },

    stop() {
        if (this.saveIntervalId) {
            clearInterval(this.saveIntervalId);
            this.saveIntervalId = null;
        }
    },

    save() {
        const currentScreen = GameState.state.session?.currentScreen;
        const isPracticing = currentScreen === 'practice-screen';

        if (isPracticing) {
            logger.log('⏸️ Auto-save skipped: Practice mode active');
            return;
        }

        GameState.save();
    }
};

export const GameSystems = {

    init() {
        GameLoop.start();
        EnergySystem.startRegeneration();
        DailyQuestTimer.start();
        BoostChecker.start();
        AutoSave.start();

        logger.log('All game systems initialized');
    },

    stop() {
        GameLoop.stop();
        EnergySystem.stopRegeneration();
        DailyQuestTimer.stop();
        BoostChecker.stop();
        AutoSave.stop();

        logger.log('All game systems stopped');
    },

    pause() {
        GameLoop.stop();
        EventBus.emit(GameEvents.GAME_PAUSED);
    },

    resume() {
        GameLoop.start();
        EventBus.emit(GameEvents.GAME_RESUMED);
    }
};

