import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Storage } from '@lib/storage.js';
import { API, Http } from '@api/http.js';
import { VocabularyAPI } from '@api/vocabulary.js';
import { GameLogic } from '@game/gameLogic.js';
import { GameLoop, EnergySystem, DailyQuestTimer, BoostChecker, AutoSave, GameSystems } from '@game/gameLoop.js';
import { Energy } from '@game/energy.js';
import { Quest } from '@components/quest/quest.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { WrongWordsManager } from '@components/vocab/wrongWords/wrongWordsManager.js';
import { SessionService } from '@components/practice/sessionService.js';
import { PracticeManager } from '@components/practice/practiceManager.js';
import { getToeicExitGuard } from '@components/toeic/toeicRunGuard.js';

const GameContext = createContext(null);

export function GameProvider({ children }) {
    const [initialized, setInitialized] = useState(false);
    const [user, setUser] = useState(null);
    const [resources, setResources] = useState({ energy: 100, maxEnergy: 100, coins: 0, gems: 0, hints: 0, shields: 0, timeFreezes: 0 });
    const [streak, setStreak] = useState({ current: 0, longest: 0 });
    const [settings, setSettings] = useState({});
    const [currentScreen, setCurrentScreen] = useState('home-screen');
    const [menuOpen, setMenuOpen] = useState(false);

    const syncFromState = useCallback(() => {
        const s = GameState.state;
        setUser({ ...s.user });
        setResources({ ...s.resources });
        setStreak({ ...s.streak });
        setSettings({ ...s.settings });
    }, []);

    useEffect(() => {
        // Expose core ES modules as window globals for vanilla JS compatibility
        window.GameState = GameState;
        window.Config = Config;
        window.Utils = Utils;
        window.EventBus = EventBus;
        window.GameEvents = GameEvents;
        window.Storage = Storage;
        window.API = API;
        window.Http = Http;
        window.PracticeManager = PracticeManager;
        window.UI = {
            showScreen: (screenId) => window._reactShowScreen?.(screenId),
            closeMenu: () => window._reactSetMenuOpen?.(false),
            toggleMenu: () => window._reactSetMenuOpen?.(open => !open),
        };

        GameState.init().then(() => {
            // ⚠️ Quest.init() bị lạc trong lúc migrate sang React. Hệ quả:
            // - EventBus subscriptions cho WORD_LEARNED / STREAK_* không gắn
            //   → quest 'learn-words' / 'daily-streak' không tick.
            // - Quest._cache không được nạp trước → khi user hoàn thành session
            //   mà chưa từng mở tab Nhiệm vụ → updateProgress lặp cache rỗng,
            //   không có quest nào tăng → server vẫn 0 → "đã làm xong nhưng
            //   tiến trình không cập nhật" (đúng triệu chứng).
            Quest.init();
            // Khôi phục đề đã chọn từ lần trước — nếu không gọi thì sau F5
            // currentTopic luôn null → HomeScreen luôn mở popup chọn đề.
            TopicSelector.restoreLastTopic().catch(() => {});
            syncFromState();
            setInitialized(true);
        });

        // Heartbeat — ping server mỗi 5 phút khi đã đăng nhập để
        // leaderboard biết user đang online (ngưỡng 15 phút). Trước đây
        // lastLoginAt chỉ update khi sang ngày mới → chấm xanh tịt sau ~15p.
        const heartbeat = () => {
            try {
                const raw = localStorage.getItem('authToken');
                if (!raw) return;
                const token = (() => { try { return JSON.parse(raw).token || raw; } catch { return raw; } })();
                if (!token) return;
                fetch('/api/user/heartbeat', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token },
                }).catch(() => {});
            } catch (_) {}
        };
        heartbeat(); // tick ngay
        const hbTimer = setInterval(heartbeat, 5 * 60 * 1000);

        // Hồi năng lượng theo thời gian thực → header tự cập nhật (không cần F5).
        // Tự tính số phút trôi qua rồi cộng năng lượng + ép sync UI mỗi 10s.
        const tickEnergy = () => {
            const r = GameState.state?.resources;
            if (r && r.lastEnergyUpdate && r.energy < r.maxEnergy) {
                const mins = Math.floor((Date.now() - r.lastEnergyUpdate) / 60000);
                if (mins > 0) {
                    GameState.addEnergy(mins * GameState.energyRegenPerMinute());
                    r.lastEnergyUpdate += mins * 60000; // giữ phần dư giây cho chính xác
                }
            }
            syncFromState();
        };
        tickEnergy();
        const energyTimer = setInterval(tickEnergy, 10000);

        const unsubs = [
            EventBus.on(GameEvents.USER_LEVEL_UP, syncFromState),
            EventBus.on(GameEvents.USER_XP_GAINED, syncFromState),
            EventBus.on(GameEvents.ENERGY_CHANGED, syncFromState),
            EventBus.on(GameEvents.COINS_CHANGED, syncFromState),
            EventBus.on(GameEvents.GEMS_CHANGED, syncFromState),
            EventBus.on(GameEvents.STREAK_UPDATED, syncFromState),
            EventBus.on(GameEvents.GAME_INITIALIZED, syncFromState),
            EventBus.on(GameEvents.USER_LOGIN, () => { syncFromState(); heartbeat(); }),
            EventBus.on(GameEvents.USER_LOGOUT, syncFromState),
            // Canonical signal — new code uses GameState.commit() instead of
            // calling syncFromState() by hand.
            EventBus.on(GameEvents.STATE_CHANGED, syncFromState),
        ];

        return () => {
            unsubs.forEach(fn => fn());
            clearInterval(hbTimer);
            clearInterval(energyTimer);
        };
    }, [syncFromState]);

    const showScreen = useCallback((screenId) => {
        // Single chokepoint: leaving an active (uncompleted) practice session
        // — via any nav (back btn, Home, avatar, side menu) — must go through
        // PracticeManager.exit() so the "Thoát luyện tập?" confirm always shows.
        const sess = PracticeManager.currentSession;
        if (screenId !== 'practice-screen' && sess && !sess.completed) {
            setMenuOpen(false); // close side menu so the confirm modal is visible
            PracticeManager.exit(screenId); // confirms, then navigates on accept
            return;
        }
        // Cùng logic cho bài thi TOEIC (chạy trong toeic-screen, không qua
        // PracticeManager): rời màn khi đang làm bài → hỏi trước.
        const toeicConfirm = getToeicExitGuard();
        if (screenId !== 'toeic-screen' && toeicConfirm) {
            setMenuOpen(false);
            toeicConfirm(() => {
                setCurrentScreen(screenId);
                EventBus.emit(GameEvents.SCREEN_CHANGED, { screen: screenId });
            });
            return;
        }
        setCurrentScreen(screenId);
        setMenuOpen(false);
        EventBus.emit(GameEvents.SCREEN_CHANGED, { screen: screenId });
    }, []);

    // Keep window.UI in sync with React functions
    useEffect(() => {
        window._reactShowScreen = showScreen;
        window._reactSetMenuOpen = setMenuOpen;
        window._reactMenuOpen = menuOpen;
    }, [showScreen, setMenuOpen, menuOpen]);

    const value = {
        initialized,
        user,
        resources,
        streak,
        settings,
        currentScreen,
        menuOpen,
        setMenuOpen,
        showScreen,
        syncFromState,
        gameState: GameState,
    };

    return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
    const ctx = useContext(GameContext);
    if (!ctx) throw new Error('useGame must be used inside GameProvider');
    return ctx;
}
