// ===================================
// THEME SERVICE
// ===================================
// Single home for the color/theme logic that was duplicated between
// SettingsScreen.jsx (apply + persist) and App.jsx (apply on startup).
// Pure DOM/localStorage side-effects, no React. Behaviour is intentionally
// identical to the previous inline copies.

import { GameState } from '@game/state.js';
import {
    STORAGE_KEYS,
    colorThemeKey,
    COLOR_THEME_GUEST_KEY,
} from '@/constants/storageKeys.js';

// Màu mặc định của hệ thống (đỏ–cam). Khách chưa đăng nhập luôn dùng màu này.
export const DEFAULT_PRIMARY = '#E11D48';
export const DEFAULT_SECONDARY = '#F97316';

/** Chưa đăng nhập (không có user id) → coi là khách. */
export function isGuestUser() {
    return !GameState.state?.user?.id;
}

function hexToRgb(hex) {
    const num = parseInt(hex.replace('#', ''), 16);
    return `${(num >> 16) & 255},${(num >> 8) & 255},${num & 255}`;
}

function adjustColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** Write the CSS custom properties (no persistence). */
function setColorVars(primary, secondary) {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', primary);
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-dark', adjustColor(primary, -30));
    root.style.setProperty('--primary-light', adjustColor(primary, 40));
    root.style.setProperty('--primary-rgb', hexToRgb(primary));
    root.style.setProperty('--secondary-color', secondary);
    root.style.setProperty('--secondary-dark', adjustColor(secondary, -30));
    root.style.setProperty('--secondary-light', adjustColor(secondary, 60));
    root.style.setProperty('--secondary-rgb', hexToRgb(secondary));
}

/** localStorage key for the current user's color theme (guest if no user). */
export function currentColorThemeKey() {
    return colorThemeKey(GameState.state?.user?.id);
}

/**
 * Apply a color theme and (by default) persist it under the current user's
 * key — same as the old SettingsScreen.applyColorTheme().
 */
export function applyColorTheme(primary, secondary, { persist = true } = {}) {
    setColorVars(primary, secondary);
    if (persist) {
        localStorage.setItem(currentColorThemeKey(), JSON.stringify({ primary, secondary }));
    }
}

/**
 * Restore the saved color theme on startup (no persist). Reads the per-user
 * key, falling back to the guest bucket — same as the old
 * App.applySavedColorTheme().
 */
export function applySavedColorTheme() {
    // Khách chưa đăng nhập → luôn dùng màu mặc định, bỏ qua màu đã lưu.
    if (isGuestUser()) {
        setColorVars(DEFAULT_PRIMARY, DEFAULT_SECONDARY);
        return;
    }
    const saved = JSON.parse(
        localStorage.getItem(currentColorThemeKey())
        || localStorage.getItem(COLOR_THEME_GUEST_KEY)
        || 'null'
    );
    if (saved?.primary && saved?.secondary) {
        setColorVars(saved.primary, saved.secondary);
    } else {
        setColorVars(DEFAULT_PRIMARY, DEFAULT_SECONDARY);
    }
}

/** Set the light/dark/auto `data-theme` attribute (no persistence). */
export function applyUiTheme(theme) {
    if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme || 'light');
    }
}

export { STORAGE_KEYS };
