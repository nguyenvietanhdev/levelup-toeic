// ===================================
// SETTINGS SERVICE
// ===================================
// "Restore default settings" — wipes every settings-related localStorage
// key + resets GameState.state.settings to DEFAULT_SETTINGS + repaints the
// default theme. Does NOT touch progress/resources (that's resetProgress).
// Orchestration only — UI feedback + reload stay in the component.

import { GameState } from '@game/state.js';
import { STORAGE_KEYS, COLOR_THEME_GUEST_KEY } from '@/constants/storageKeys.js';
import { applyUiTheme, applyColorTheme, currentColorThemeKey } from '@/services/theme.js';

// Canonical defaults for the bits stored outside GameState.settings.
const DEFAULT_THEME = 'light';
const DEFAULT_PRIMARY = '#E11D48';       // = COLOR_PRESETS[0]
const DEFAULT_SECONDARY = '#F97316';

export async function resetAllSettings() {
    // 1. Drop all settings-related localStorage keys.
    [
        STORAGE_KEYS.USER_SETTINGS,
        STORAGE_KEYS.PRACTICE_SOUND_ENABLED,
        STORAGE_KEYS.REVERSE_MODE,
        STORAGE_KEYS.TOEIC_VOICE,
        STORAGE_KEYS.TOEIC_SPEECH_RATE,
        currentColorThemeKey(),
        COLOR_THEME_GUEST_KEY,
    ].forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });

    // 2. Reset GameState.settings → defaults (persists).
    await GameState.resetSettings();

    // 3. Restore the default theme (UI + colors). Persist theme so the
    //    post-reload startup is consistent.
    try { localStorage.setItem(STORAGE_KEYS.THEME, DEFAULT_THEME); } catch { /* ignore */ }
    applyUiTheme(DEFAULT_THEME);
    applyColorTheme(DEFAULT_PRIMARY, DEFAULT_SECONDARY, { persist: false });
}
