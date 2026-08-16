/**
 * Đổi cài đặt rồi RELOAD ngay thì phải ĐỢI ghi xong.
 *
 * `GameState.save()` KHÔNG ghi ngay: nó hẹn 100ms rồi mới gọi `_performSave()`,
 * và trả về liền — nên `await save()` cũng không đợi được mạng. Chỗ nào gọi
 * xong là `location.reload()` thì trang chết trước khi hẹn giờ kịp chạy, thay
 * đổi mất sạch mà không báo gì.
 *
 * Đúng lỗi người dùng gặp: bấm chuyển sang Tiếng Trung, load lại thấy nhảy về
 * Tiếng Anh. Trước đây localStorage ghi đè lên server nên bản 'zh' ở máy che
 * mất lỗi; khi sửa hướng đồng bộ cho đúng (server là nguồn chính) thì nó lộ ra.
 *
 * `saveNow()` bỏ qua hẹn giờ và `await` tới lúc ghi xong.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const state = readFileSync(join(__dirname, 'state.js'), 'utf8');

describe('saveNow — ghi ngay, đợi xong mới trả về', () => {
    test('có trong GameState', () => {
        expect(state).toMatch(/async saveNow\(\)/);
    });

    test('gọi thẳng _performSave, KHÔNG qua setTimeout', () => {
        const i = state.indexOf('async saveNow()');
        const body = state.slice(i, state.indexOf('async _performSave()', i));
        expect(body).toMatch(/await this\._performSave\(\)/);
        expect(body).not.toMatch(/setTimeout/);
    });

    test('huỷ lệnh hoãn đang chờ để không ghi hai lần', () => {
        // Nội dung của lệnh hoãn nằm trong `this.state` rồi; để lại thì sau khi
        // ghi xong nó chạy thêm một lần vô ích.
        const i = state.indexOf('async saveNow()');
        const body = state.slice(i, state.indexOf('async _performSave()', i));
        expect(body).toMatch(/clearTimeout\(this\._saveTimeout\)/);
    });

    test('vẫn tôn trọng post-init guard', () => {
        // Guard này chặn save lạc ngay sau init ghi đè dữ liệu server vừa tải.
        // Bỏ qua nó là mở lại đúng lỗi mà nó sinh ra để chặn.
        const i = state.indexOf('async saveNow()');
        const body = state.slice(i, state.indexOf('async _performSave()', i));
        expect(body).toMatch(/_justInitialized/);
        expect(body).toMatch(/_initBlockUntil/);
    });
});

describe('hành vi thật của saveNow', () => {
    let GameState;

    beforeEach(async () => {
        vi.resetModules();
        ({ GameState } = await import('./state.js'));
        GameState._justInitialized = false;
        GameState._initBlockUntil = 0;
    });

    test('ghi xong RỒI mới trả về (không cần chờ hẹn giờ)', async () => {
        let done = false;
        GameState._performSave = async () => {
            await new Promise((r) => setTimeout(r, 20));
            done = true;
        };
        await GameState.saveNow();
        // Nếu `saveNow` trả về sớm thì đây còn false — và `location.reload()`
        // ngay sau đó sẽ cắt ngang lệnh ghi.
        expect(done).toBe(true);
    });

    test('save() thường KHÔNG đợi — lý do phải có saveNow', async () => {
        let done = false;
        GameState._performSave = async () => { done = true; };
        await GameState.save();
        // `save()` mới chỉ hẹn giờ; chưa ghi gì cả.
        expect(done).toBe(false);
    });

    test('post-init guard: không ghi, báo false', async () => {
        let called = false;
        GameState._performSave = async () => { called = true; };
        GameState._initBlockUntil = Date.now() + 10_000;
        expect(await GameState.saveNow()).toBe(false);
        expect(called).toBe(false);
    });
});

describe('resetSettings cũng reload ngay sau đó', () => {
    test('dùng saveNow, không phải save', () => {
        // `handleResetSettings` chờ 800ms rồi reload — đủ để qua hẹn giờ 100ms,
        // nhưng đó là ăn may chứ không phải bảo đảm: máy chậm hoặc mạng lag là
        // mất cài đặt mặc định vừa khôi phục.
        const i = state.indexOf('async resetSettings()');
        expect(i).toBeGreaterThan(-1);
        const body = state.slice(i, i + 200);
        expect(body).toMatch(/await this\.saveNow\?\.\(\)/);
    });
});

describe('nơi đổi ngôn ngữ học phải đợi ghi', () => {
    const cases = [
        ['QuickSettings', join(__dirname, '..', 'layouts', 'QuickSettings.jsx')],
        ['PracticePanel', join(__dirname, '..', 'components', 'settings', 'panels', 'PracticePanel.jsx')],
    ];

    test.each(cases)('%s: await saveNow trước khi reload', (_name, path) => {
        const src = readFileSync(path, 'utf8');
        const r = src.indexOf('location.reload()');
        expect(r).toBeGreaterThan(-1);
        // `saveNow` phải nằm TRƯỚC lệnh reload trong cùng luồng.
        const before = src.slice(0, r);
        expect(before).toMatch(/await window\.GameState\??\.?saveNow\?\.\(\)/);
    });

    test.each(cases)('%s: dịch levelFilter sang khung ngôn ngữ mới', (_name, path) => {
        // en dùng CEFR, zh dùng HSK, mà bộ lọc so khớp CHÍNH XÁC từng chuỗi.
        // Giữ `['A1','A2']` khi sang tiếng Trung là lọc ra 0 từ — vào luyện tập
        // báo hết từ trong khi ô độ khó vẫn hiện "Dễ", không ai hiểu vì sao.
        const src = readFileSync(path, 'utf8');
        expect(src).toMatch(/levelsFor\(/);
    });
});
