/**
 * "Khôi phục cài đặt mặc định" phải dọn SẠCH, kể cả cài đặt mới thêm sau này.
 *
 * Bản cũ gõ cứng danh sách khoá cần xoá, nên mỗi cài đặt mới là một khoá bị bỏ
 * sót mà không có gì nhắc. Thực tế đã sót: giọng đọc tách theo ngôn ngữ
 * (`toeic_voice_en` / `_zh` / `_vi`), ngôn ngữ từ vựng (`vocabLang`), part/đề
 * đang chọn, và lựa chọn của popup Dịch.
 *
 * Cách chữa là ĐẢO NGƯỢC: nêu tên thứ phải GIỮ, xoá tất cả phần còn lại.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stateSrc = readFileSync(join(__dirname, '..', 'game', 'state.js'), 'utf8');

vi.mock('@game/state.js', () => ({
    GameState: { resetSettings: vi.fn().mockResolvedValue(undefined) },
    DEFAULT_SETTINGS: {},
}));
vi.mock('@/services/theme.js', () => ({
    applyUiTheme: vi.fn(),
    applyColorTheme: vi.fn(),
    currentColorThemeKey: () => 'colorTheme_u1',
}));

const { resetAllSettings } = await import('./settings.js');
const { GameState } = await import('@game/state.js');

/** Nạp localStorage với một loạt khoá. */
const nap = (obj) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(obj)) localStorage.setItem(k, v);
};

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => localStorage.clear());

describe('xoá những khoá TỪNG BỊ SÓT', () => {
    test('giọng đọc tách theo ngôn ngữ', async () => {
        // Đây là khoá thêm sau khi `resetAllSettings` được viết — đúng loại bị
        // bỏ quên. `toeic_voice` cũ thì có trong danh sách cũ, ba khoá này thì
        // không, nên đổi giọng xong "khôi phục mặc định" là giọng vẫn nguyên.
        nap({ toeic_voice_en: 'x', toeic_voice_zh: 'y', toeic_voice_vi: 'z' });
        await resetAllSettings();
        expect(localStorage.getItem('toeic_voice_en')).toBeNull();
        expect(localStorage.getItem('toeic_voice_zh')).toBeNull();
        expect(localStorage.getItem('toeic_voice_vi')).toBeNull();
    });

    test('ngôn ngữ từ vựng đang học', async () => {
        nap({ vocabLang: 'zh' });
        await resetAllSettings();
        expect(localStorage.getItem('vocabLang')).toBeNull();
    });

    test('part / đề / cách chọn câu đang dùng', async () => {
        nap({ selectedPart: 'Part 3', selectedTopic: 't1', practiceMode: 'random-all' });
        await resetAllSettings();
        expect(localStorage.getItem('selectedPart')).toBeNull();
        expect(localStorage.getItem('selectedTopic')).toBeNull();
        expect(localStorage.getItem('practiceMode')).toBeNull();
    });

    test('lựa chọn của popup Dịch nhanh', async () => {
        nap({ 'translate:lastPart': 'p', 'translate:lastSource': 's' });
        await resetAllSettings();
        expect(localStorage.getItem('translate:lastPart')).toBeNull();
        expect(localStorage.getItem('translate:lastSource')).toBeNull();
    });

    test('khoá HOÀN TOÀN MỚI cũng bị xoá — đây mới là điều quan trọng', async () => {
        // Cách nêu-thứ-phải-giữ nghĩa là cài đặt thêm sau này tự động được dọn,
        // không phải nhớ sửa hàm này nữa.
        nap({ mot_cai_dat_chua_ton_tai: '1' });
        await resetAllSettings();
        expect(localStorage.getItem('mot_cai_dat_chua_ton_tai')).toBeNull();
    });
});

describe('vẫn xoá những khoá bản cũ đã xoá', () => {
    test('userSettings, âm luyện tập, đảo chiều, giọng cũ, tốc độ đọc', async () => {
        nap({
            userSettings: '{}', practiceSoundEnabled: 'false', reverseMode: 'true',
            toeic_voice: 'v', toeic_speech_rate: '90', theme: 'dark',
            colorTheme_u1: '{}', colorTheme_guest: '{}',
        });
        await resetAllSettings();
        for (const k of ['userSettings', 'practiceSoundEnabled', 'reverseMode',
            'toeic_voice', 'toeic_speech_rate', 'colorTheme_u1', 'colorTheme_guest']) {
            expect(localStorage.getItem(k), k).toBeNull();
        }
    });
});

describe('KHÔNG đụng tiến độ và phiên đăng nhập', () => {
    test('giữ token đăng nhập', async () => {
        // Xoá là người dùng bị đăng xuất — chuyện hoàn toàn khác với "khôi
        // phục cài đặt", mà popup thì không hề báo trước.
        nap({ authToken: '{"token":"abc"}' });
        await resetAllSettings();
        expect(localStorage.getItem('authToken')).toBe('{"token":"abc"}');
    });

    test('giữ tiến độ học', async () => {
        // Popup nói rõ "Tiến độ học không bị ảnh hưởng".
        nap({ gameState: '{"xp":100}' });
        await resetAllSettings();
        expect(localStorage.getItem('gameState')).toBe('{"xp":100}');
    });

    test('giữ những thứ đã xử lý một lần rồi', async () => {
        // Xoá là nhắc lại từ đầu: bài thi dở, cảnh báo hết hạn bộ từ, thống kê
        // đã xuất. Phiền mà chẳng khôi phục cài đặt gì.
        nap({
            toeic_dismissed_attempt_abc123: '1',
            expiryHandledSigs: '[]',
            statsExportedMonth: '2026-08',
        });
        await resetAllSettings();
        expect(localStorage.getItem('toeic_dismissed_attempt_abc123')).toBe('1');
        expect(localStorage.getItem('expiryHandledSigs')).toBe('[]');
        expect(localStorage.getItem('statsExportedMonth')).toBe('2026-08');
    });
});

describe('đặt lại GameState và giao diện', () => {
    test('gọi `GameState.resetSettings()`', async () => {
        await resetAllSettings();
        expect(GameState.resetSettings).toHaveBeenCalled();
    });

    test('ghi lại theme mặc định SAU khi đã xoá', async () => {
        // Xoá rồi mới ghi, không thì vòng quét xoá luôn cái vừa đặt.
        nap({ theme: 'dark' });
        await resetAllSettings();
        expect(localStorage.getItem('theme')).toBe('light');
    });
});

describe('`DEFAULT_SETTINGS` đủ mọi trường được ghi', () => {
    /** Tên trường khai trong `DEFAULT_SETTINGS`. */
    const macDinh = (() => {
        const i = stateSrc.indexOf('DEFAULT_SETTINGS = {');
        const blk = stateSrc.slice(i, stateSrc.indexOf('\n};', i));
        return new Set([...blk.matchAll(/^ {4}([a-zA-Z_]+):/gm)].map((m) => m[1]));
    })();

    // `resetSettings()` thay NGUYÊN `state.settings` bằng bảng này. Thiếu tên
    // nào thì "khôi phục mặc định" biến nó thành `undefined` thay vì đưa về
    // giá trị đúng, và bản ghi gửi lên server cũng mất trường đó.
    for (const truong of [
        'autoAdvance', 'pronounceSentence', 'dailyStudyGoalMin',
        'toeicTargetScore', 'reverseMode', 'reviewKinds', 'selectedPart',
    ]) {
        test(`có \`${truong}\``, () => {
            expect(macDinh.has(truong)).toBe(true);
        });
    }

    test('giá trị khớp với giá trị lùi ở nơi đọc', () => {
        // Lệch nhau thì "mặc định" hiện ở màn Cài đặt khác với mặc định thật.
        expect(stateSrc).toMatch(/dailyStudyGoalMin: 15/);   // HomeScreen: ?? 15
        expect(stateSrc).toMatch(/toeicTargetScore: 0/);     // GeneralPanel: ?? 0
        expect(stateSrc).toMatch(/autoAdvance: true/);       // exampleBlock: !== false
        expect(stateSrc).toMatch(/pronounceSentence: false/); // pronunciationMode: === true
    });

    test('`theme` KHÔNG nằm trong đó', () => {
        // Nó sống ở localStorage và `resetAllSettings` xử lý riêng; khai cả hai
        // nơi là hai nguồn sự thật cho một giá trị.
        expect(macDinh.has('theme')).toBe(false);
    });
});
