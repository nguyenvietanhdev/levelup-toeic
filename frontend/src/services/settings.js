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

/**
 * Khoá localStorage KHÔNG được xoá — chúng không phải cài đặt.
 *
 * Nêu tên thứ phải GIỮ thay vì liệt kê thứ phải xoá: danh sách xoá gõ cứng thì
 * mỗi cài đặt mới thêm vào app là một khoá bị bỏ sót, mà không có gì nhắc. Đó
 * đúng là chuyện đã xảy ra — giọng đọc tách theo ngôn ngữ, ngôn ngữ từ vựng,
 * part/đề đang chọn đều sót lại sau khi "khôi phục mặc định".
 */
const GIU_LAI = new Set([
    STORAGE_KEYS.AUTH_TOKEN,   // đăng xuất người dùng là chuyện khác hẳn
    STORAGE_KEYS.GAME_STATE,   // tiến độ: XP, coins, từ đã học
]);

/** Tiền tố của khoá tiến độ/hệ thống cần giữ. */
const TIEN_TO_GIU = [
    'toeic_dismissed_attempt_',  // đã tắt nhắc bài thi dở — nhắc lại là phiền
    'expiryHandledSigs',         // đã xử lý cảnh báo hết hạn bộ từ
    'statsExportedMonth',        // đã xuất thống kê tháng này
    'notif',                     // thông báo đã đọc
    'debugLeaks',                // cờ gỡ lỗi của lập trình viên
];

export async function resetAllSettings() {
    // 1. Xoá MỌI khoá trừ những khoá thuộc diện giữ lại.
    //
    // Quét thật thay vì gõ cứng danh sách: xem `GIU_LAI` ở trên.
    let khoa = [];
    try {
        khoa = Object.keys(localStorage);
    } catch { /* localStorage bị chặn — không có gì để xoá */ }

    for (const k of khoa) {
        if (GIU_LAI.has(k)) continue;
        if (TIEN_TO_GIU.some(t => k.startsWith(t))) continue;
        try { localStorage.removeItem(k); } catch { /* ignore */ }
    }

    // Màu chủ đề nằm ngoài vòng quét khi localStorage không liệt kê được
    // (chế độ riêng tư của một số trình duyệt) — xoá thẳng cho chắc.
    [currentColorThemeKey(), COLOR_THEME_GUEST_KEY]
        .forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });

    // 2. Reset GameState.settings → defaults (persists).
    await GameState.resetSettings();

    // 3. Restore the default theme (UI + colors). Persist theme so the
    //    post-reload startup is consistent.
    try { localStorage.setItem(STORAGE_KEYS.THEME, DEFAULT_THEME); } catch { /* ignore */ }
    applyUiTheme(DEFAULT_THEME);
    applyColorTheme(DEFAULT_PRIMARY, DEFAULT_SECONDARY, { persist: false });
}
