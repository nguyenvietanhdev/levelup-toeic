/**
 * Single registry for every localStorage key the app uses.
 *
 * Why this exists: keys were previously written as bare string literals
 * scattered across ~10 files. That directly caused bugs like the
 * `practiceSound` vs `practiceSoundEnabled` mismatch. New code MUST import
 * from here instead of typing the string. (Existing call sites are migrated
 * incrementally — not in one churn.)
 */

export const STORAGE_KEYS = Object.freeze({
    /** Auth token, stored as JSON: `{ token: string }`. */
    AUTH_TOKEN: 'authToken',
    /** Full serialized game state (resources, progress, settings, ...). */
    GAME_STATE: 'gameState',
    /** Subset of settings persisted locally as a reliable backup. */
    USER_SETTINGS: 'userSettings',
    /** Practice background-music on/off ('true' | 'false'). */
    PRACTICE_SOUND_ENABLED: 'practiceSoundEnabled',
    /** EN→VN vs VN→EN practice direction ('true' | 'false'). */
    REVERSE_MODE: 'reverseMode',
    /** UI theme ('dark' | 'light' | 'auto'). */
    THEME: 'theme',
    /** Selected TTS voice id/name. */
    TOEIC_VOICE: 'toeic_voice',
    /** TTS speech rate (percent, e.g. '80'). */
    TOEIC_SPEECH_RATE: 'toeic_speech_rate',
});

/**
 * Per-user custom color theme key. Falls back to the guest bucket.
 * @param {string} [uid] user id; omit/empty → guest.
 */
export function colorThemeKey(uid) {
    return `colorTheme_${uid || 'guest'}`;
}

/** Guest color-theme key (constant for the no-user case). */
export const COLOR_THEME_GUEST_KEY = colorThemeKey('guest');
