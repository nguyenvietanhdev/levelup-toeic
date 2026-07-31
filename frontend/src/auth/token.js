/**
 * Centralized auth-token access.
 *
 * Replaces 5 byte-identical copies of `getAuthToken()` and the auth-header
 * construction that was duplicated across ~14 call sites. Behaviour is
 * intentionally unchanged from the previous inline copies.
 */

import { STORAGE_KEYS } from '@/constants/storageKeys.js';

/**
 * @returns {string|null} the bearer token, or null if absent/unparseable.
 */
export function getToken() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '{}').token || null;
    } catch {
        return null;
    }
}

/**
 * Authorization header object, spread-friendly.
 * @returns {{ Authorization: string } | {}} `{}` when not logged in.
 */
export function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
