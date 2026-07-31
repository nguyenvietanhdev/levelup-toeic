// ===================================
// BACKUP SERVICE
// ===================================
// Data mechanics for backup / restore / reset, extracted from
// SettingsScreen.jsx. UI feedback (notifications, confirm modal, reload)
// stays in the component — this layer only touches data + the file system.
// Behaviour identical to the previous inline handlers.

import { GameState } from '@game/state.js';
import { API } from '@api/http.js';

const BACKUP_VERSION = '2.0.0';

/** Build the backup JSON and trigger a browser download. Throws on failure. */
export function downloadBackup() {
    const payload = {
        version: BACKUP_VERSION,
        timestamp: new Date().toISOString(),
        data: GameState.state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `toeic-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Open a file picker and restore the chosen backup into GameState.
 * @returns {Promise<boolean>} resolves `true` when restored & saved,
 *   `false` if the user picked no file; rejects on an invalid file.
 */
export function pickAndRestoreBackup() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) { resolve(false); return; }
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const backup = JSON.parse(ev.target.result);
                    if (!backup.version || !backup.data) throw new Error('Invalid backup file');
                    GameState.state = backup.data;
                    await GameState.save();
                    resolve(true);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });
}

/** Wipe all progress — calls backend then clears local state. */
export async function resetProgress() {
    const confirmUserId = GameState.state?.user?._id;
    const res = await API.user.resetProgress(confirmUserId);
    if (!res.success) throw new Error(res.message || res.error || 'Reset thất bại');
    await GameState.reset?.();
}
