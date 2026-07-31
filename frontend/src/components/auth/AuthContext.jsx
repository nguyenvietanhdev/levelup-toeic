import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { API } from '@api/http.js';
import { ServerStorage } from '@lib/serverStorage.js';
import { Storage } from '@lib/storage.js';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { applySavedColorTheme } from '@/services/theme.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [isLoggedIn, setIsLoggedIn] = useState(() => {
        try {
            const stored = localStorage.getItem('authToken');
            if (!stored) return false;
            const parsed = JSON.parse(stored);
            return !!(parsed.token && parsed.token.length > 20);
        } catch { return false; }
    });
    const [currentUser, setCurrentUser] = useState(null);
    const [authModal, setAuthModal] = useState(null); // null | 'login' | 'register' | 'forgotPassword'
    const [isServerSynced, setIsServerSynced] = useState(false);

    const getToken = useCallback(() => {
        try {
            const stored = localStorage.getItem('authToken');
            if (!stored) return null;
            const parsed = JSON.parse(stored);
            return parsed.token || null;
        } catch { return null; }
    }, []);

    const setUser = useCallback((data, token) => {
        if (token) {
            localStorage.setItem('authToken', JSON.stringify({ token }));
            ServerStorage.setToken(token);
            Storage.mode = 'server';
        }

        if (!data) return;

        // Normalize shape: login/register return a fullState { user, resources,
        // streak, settings, ... }; validateToken passes the unwrapped user object.
        const isFullState = data.user && typeof data.user === 'object';
        const u = isFullState ? data.user : data;
        const src = isFullState ? data : data; // resources/streak/settings live at top level in both

        GameState.state.user = {
            ...GameState.state.user,
            id: u._id || u.id,
            username: u.profile?.username || u.username || u.email?.split('@')[0],
            avatar: u.profile?.avatar || u.avatar || u.username?.charAt(0)?.toUpperCase() || 'P',
            level: u.stats?.level || u.level || 1,
            xp: u.stats?.xp || u.xp || 0,
            totalXp: u.stats?.totalXp || u.totalXp || 0,
            email: u.email,
            role: u.role,
            isGuest: false,
        };

        if (src.resources) {
            GameState.state.resources = { ...GameState.state.resources, ...src.resources };
        }
        if (src.streak) {
            GameState.state.streak = { ...GameState.state.streak, ...src.streak };
        }
        if (src.settings) {
            GameState.state.settings = { ...GameState.state.settings, ...src.settings };
        }

        setCurrentUser(u);
        setIsLoggedIn(true);
        // Đã đăng nhập → áp màu chủ đề đã lưu của user (khách bị ép màu mặc định).
        applySavedColorTheme();
        EventBus.emit(GameEvents.USER_LOGIN, u);
    }, []);

    const logout = useCallback(async () => {
        try { await API.auth.logout(); } catch (_) {}
        localStorage.removeItem('authToken');
        ServerStorage.clearToken();
        Storage.mode = 'local';

        // Reset in-memory state to guest + clear cached state so the post-reload
        // GameState.init() (now in local mode) doesn't restore the old user.
        GameState.resetToGuest?.();
        try { localStorage.removeItem('gameState'); } catch (_) {}

        setIsLoggedIn(false);
        setCurrentUser(null);
        EventBus.emit(GameEvents.USER_LOGOUT);
        setTimeout(() => window.location.reload(), 300);
    }, []);

    const validateToken = useCallback(async () => {
        const token = getToken();
        if (!token) {
            setIsServerSynced(true); // not logged in, no server sync needed
            return false;
        }
        const res = await API.auth.getMe();
        if (res.success && res.data?.user) {
            const user = res.data.user;
            if (user.role === 'admin') { logout(); setIsServerSynced(true); return false; }
            setUser(user, token);

            // Apply full server state if available
            if (res.data.gameState) {
                GameState.applyServerState(res.data.gameState);
            }
        }
        setIsServerSynced(true);
        return res.success;
    }, [getToken, setUser, logout]);

    // Auto-logout khi bất kỳ API nào trả 401 (token expired)
    const logoutHandledRef = useRef(false);
    const isLoggedInRef = useRef(isLoggedIn);
    useEffect(() => { isLoggedInRef.current = isLoggedIn; }, [isLoggedIn]);
    useEffect(() => {
        const handler = () => {
            if (logoutHandledRef.current || !isLoggedInRef.current) return;
            logoutHandledRef.current = true;
            logout();
        };
        EventBus.on(GameEvents.AUTH_EXPIRED, handler);
        return () => EventBus.off(GameEvents.AUTH_EXPIRED, handler);
    }, [logout]);

    const value = {
        isLoggedIn,
        isServerSynced,
        currentUser,
        authModal,
        setAuthModal,
        setUser,
        logout,
        validateToken,
        getToken,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
