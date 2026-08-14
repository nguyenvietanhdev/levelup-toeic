/**
 * Màn Âm thanh: tách mục chung chung, và MÀU của ô bật/tắt phải nói lên trạng thái.
 *
 * Hai vấn đề gốc:
 *
 *   1. "Hiệu ứng âm thanh" mô tả là "âm thanh khi trả lời" nhưng thực ra tắt cả
 *      tiếng bấm nút, mở rương, vòng quay. Ai tắt vì khó chịu tiếng click thì
 *      mất luôn phản hồi đúng/sai — thứ họ vẫn muốn giữ. Trong code đã có SẴN
 *      `soundEffects` tách riêng (uiSounds.js) mà màn Cài đặt chưa lộ ra.
 *
 *   2. Mọi ô bật/tắt đều mang nền gradient đỏ-cam (thừa hưởng từ
 *      `.quick-difficulty-selector` của thanh nav). "Tắt" trông rực rỡ y hệt
 *      "Bật" nên màu không mang thông tin gì, phải đọc chữ mới biết.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panel = readFileSync(join(__dirname, 'panels', 'SoundPanel.jsx'), 'utf8');
const toggle = readFileSync(join(__dirname, 'panels', 'Toggle.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
const state = readFileSync(join(__dirname, '..', '..', 'game', 'state.js'), 'utf8');
const utils = readFileSync(join(__dirname, '..', '..', 'lib', 'utils.js'), 'utf8');

describe('tách "Hiệu ứng âm thanh" thành các mục cụ thể', () => {
    test('không còn mục gộp mơ hồ', () => {
        expect(panel).not.toMatch(/<h4>Hiệu ứng âm thanh<\/h4>/);
    });

    test('có đủ ba công tắc riêng + công tắc tổng', () => {
        expect(panel).toMatch(/Âm phản hồi đúng \/ sai/);
        expect(panel).toMatch(/Âm thao tác giao diện/);
        expect(panel).toMatch(/Nhạc nền luyện tập/);
        expect(panel).toMatch(/Công tắc tổng/);
    });

    test('ba mục con ẩn khi tắt công tắc tổng', () => {
        // Hiện ra lúc tổng đã tắt thì người dùng chỉnh mà không thấy gì đổi.
        expect(panel).toMatch(/s\.soundEnabled !== false && \(/);
    });

    test('mục con dùng `soundEffects` — thứ ĐÃ có sẵn trong code', () => {
        // Không đẻ khoá mới cho âm giao diện: uiSounds.js vốn đã đọc khoá này.
        expect(panel).toMatch(/updateSetting\('soundEffects', v\)/);
    });
});

describe('công tắc mới phải THẬT SỰ có tác dụng', () => {
    test('`answerFeedbackSound` có trong bộ mặc định', () => {
        // Thiếu thì "khôi phục cài đặt gốc" làm mất khoá, và giá trị undefined
        // lọt xuống mọi chỗ kiểm tra.
        expect(state).toMatch(/answerFeedbackSound:\s*true/);
    });

    test('chặn ở playSound, không rắc điều kiện ra ~20 mode', () => {
        // Sửa từng mode thì chắc chắn sót vài cái — sót là âm vẫn kêu dù đã
        // tắt, phải mở đúng mode đó mới phát hiện.
        expect(utils).toMatch(/answerFeedbackSound === false/);
        const i = utils.indexOf('answerFeedbackSound');
        expect(utils.slice(Math.max(0, i - 600), i)).toMatch(/isFeedbackSound/);
    });

    test('đọc GameState qua window, tránh vòng phụ thuộc', () => {
        // state.js đã import utils.js; import ngược lại là vòng.
        expect(utils).toMatch(/window\.GameState\?\.state\?\.settings/);
        expect(utils).not.toMatch(/import .*from '@game\/state\.js'/);
    });

    test('`ignoreSettings` KHÔNG bỏ qua được lựa chọn này', () => {
        // Cờ đó dành cho lớp phát thô, không phải giấy phép bỏ qua ý người dùng.
        const i = utils.indexOf('answerFeedbackSound');
        const before = utils.slice(Math.max(0, i - 400), i);
        expect(before).not.toMatch(/if \(!ignoreSettings\) \{[^}]*$/);
    });
});

describe('màu ô bật/tắt nói lên trạng thái', () => {
    test('Toggle gắn class riêng khi BẬT', () => {
        expect(toggle).toMatch(/toggle-select--on/);
        expect(toggle).toMatch(/checked \? ' toggle-select--on' : ''/);
    });

    test('tắt = nền trung tính', () => {
        const r = css.match(/\.settings-section \.toggle-select select,[^{]*\{([^}]*)\}/);
        expect(r, 'thiếu quy tắc trạng thái tắt').toBeTruthy();
        expect(r[1]).toMatch(/background:\s*var\(--bg-secondary\)/);
    });

    test('bật = màu chủ đề', () => {
        const r = css.match(/\.settings-section \.toggle-select--on select,[^{]*\{([^}]*)\}/);
        expect(r, 'thiếu quy tắc trạng thái bật').toBeTruthy();
        expect(r[1]).toMatch(/linear-gradient/);
        expect(r[1]).toMatch(/--primary-color/);
    });

    test('CỤ THỂ HƠN HẲN gradient của dark-mode, không chỉ bằng', () => {
        // Đây là lỗi đã gặp: bản đầu dùng `.settings-section .toggle-select
        // select` (0-2-1) — HOÀ với `[data-theme="dark"]
        // .quick-difficulty-selector select` (0-2-1). Mà index.css nạp
        // dark-mode.css SAU components.css nên hoà là THUA, chế độ tối vẫn
        // gradient cho cả Bật lẫn Tắt.
        const spec = (sel) => {
            const ids = (sel.match(/#[\w-]+/g) || []).length;
            const cls = (sel.match(/\.[\w-]+/g) || []).length
                + (sel.match(/\[[^\]]+\]/g) || []).length;
            const el = (sel.replace(/\[[^\]]+\]/g, '').match(/(^|[\s>+~])[a-z]+/g) || []).length;
            return ids * 10000 + cls * 100 + el;
        };

        const dark = readFileSync(
            join(__dirname, '..', '..', 'assets', 'styles', 'dark-mode.css'), 'utf8');
        expect(dark).toMatch(/\[data-theme="dark"\] \.quick-difficulty-selector select/);
        const rival = spec('[data-theme="dark"] .quick-difficulty-selector select');

        // Nhánh có `[data-theme]` là nhánh phải thắng.
        const mine = css.match(
            /\[data-theme\] \.settings-section [^\s{,]*toggle-select--on select/);
        expect(mine, 'thiếu nhánh đủ cụ thể cho chế độ tối').toBeTruthy();
        expect(spec(mine[0])).toBeGreaterThan(rival);
    });

    test('index.css vẫn nạp dark-mode SAU components (giả định của phép tính trên)', () => {
        // Nếu ai đó đảo thứ tự thì bài toán độ cụ thể đổi hẳn — test này để biết.
        const index = readFileSync(
            join(__dirname, '..', '..', 'assets', 'styles', 'index.css'), 'utf8');
        expect(index.indexOf('components.css')).toBeLessThan(index.indexOf('dark-mode.css'));
    });

    test('option trong danh sách xổ vẫn nền thường', () => {
        // Chữ trắng trên nền trắng là không đọc được.
        expect(css).toMatch(/\.settings-section \.toggle-select select option,[^{]*\{[^}]*background/);
    });
});
