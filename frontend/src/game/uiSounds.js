/**
 * Âm hiệu ứng GIAO DIỆN (không phải phản hồi đúng/sai lúc luyện tập).
 *
 * Utils.playSound cố tình KHÔNG kiểm cài đặt âm thanh — nó là lớp phát thô, và
 * âm phản hồi đúng/sai phải kêu kể cả khi người dùng tắt nhạc nền. Còn âm giao
 * diện thì ngược lại: tắt tiếng là phải im. Nên chỗ kiểm cài đặt nằm ở đây,
 * một lần, thay vì lặp `settings?.soundEnabled !== false` ở từng nơi gọi.
 */
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';

/** Phát một âm giao diện theo tên key trong Config.sounds. */
export function playSfx(name, volume = 0.5) {
    const s = GameState.state?.settings;
    if (s?.soundEnabled === false || s?.soundEffects === false) return;
    const url = Config.sounds?.[name];
    if (url) Utils.playSound(url, volume, { ignoreSettings: true });
}

// Âm bấm nút phải RẤT nhỏ và ngắn, vì nó kêu nhiều nhất trong app.
const CLICK_VOLUME = 0.22;

/**
 * Gắn MỘT listener ở document cho tiếng bấm nút, thay vì rắc onClick khắp nơi.
 *
 * Bỏ qua ba trường hợp:
 *  - đang ở màn luyện tập / làm bài: mỗi lần chọn đáp án đã có âm đúng/sai rồi,
 *    chồng thêm tiếng click là ồn và làm loãng tín hiệu quan trọng hơn;
 *  - nút bị disabled: bấm không ăn thì cũng không nên kêu;
 *  - ô nhập, thẻ chọn màu, thanh trượt: không phải "nút".
 *
 * @returns {function} gỡ listener
 */
// ── NHẠC NỀN LÚC LUYỆN TẬP ─────────────────────────────────────────────────
// Một instance DUY NHẤT, lặp vô hạn. Không đi qua Utils.playSound vì hàm đó
// nhân bản audio cho mỗi lần gọi — âm ngắn chồng nhau thì được, nhưng nhạc nền
// mà nhân bản là hai bản chạy song song lệch pha, và không còn tay cầm nào để
// tắt riêng nó (stopAllSounds tắt sạch cả âm đúng/sai).
let _bgm = null;

/**
 * Bật nhạc nền luyện tập. Gọi lại khi đang chạy là no-op, nên bắt đầu bộ mới
 * giữa chừng không tạo bản thứ hai.
 */
export function startPracticeBgm(volume = 0.5) {
    if (GameState.state?.settings?.practiceSoundEnabled === false) return;
    if (_bgm) return;
    const url = Config.sounds?.making;
    if (!url) return;

    const audio = new Audio(url);
    audio.loop = true;      // hết file thì tua lại — luyện lâu hơn bài nhạc là chuyện thường
    audio.volume = volume;
    _bgm = audio;
    // Trình duyệt chặn autoplay thì bỏ qua, không để lại tay cầm chết.
    audio.play().catch(() => { if (_bgm === audio) _bgm = null; });
}

/** Tắt nhạc nền. Gọi khi không chạy là no-op. */
export function stopPracticeBgm() {
    if (!_bgm) return;
    _bgm.pause();
    _bgm.currentTime = 0;
    _bgm = null;
}

export function initUiClickSound() {
    const onClick = (e) => {
        const btn = e.target?.closest?.('button, .btn, .toeic-nav-btn');
        if (!btn || btn.disabled) return;
        // Trong lúc làm bài/luyện tập thì im — nhường chỗ cho âm đúng/sai.
        const screen = GameState.state?.session?.currentScreen;
        if (screen === 'practice-screen' || screen === 'toeic-test-screen') return;
        playSfx('click', CLICK_VOLUME);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
}
