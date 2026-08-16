/**
 * Popup nhận thưởng mở TỪ bảng Thông báo phải nằm TRÊN bảng đó.
 *
 * `.notif-overlay` và `#modal-container` cùng z-index 1100. Bằng nhau thì thứ
 * tự DOM quyết định, mà bảng Thông báo render sau → nó che mất popup. Người
 * dùng bấm "Nhận thưởng": phần thưởng VẪN được cộng, chỉ là popup mở ra ở dưới
 * nên nhìn như nút không hoạt động. Không có lỗi nào trong console.
 *
 * Đúng loại lỗi mà đọc mã nguồn không thấy — phải so hai con số ở hai file CSS
 * khác nhau mới ra.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const S = join(__dirname, '..', 'assets', 'styles');
const base = readFileSync(join(S, 'base.css'), 'utf8');
const layout = readFileSync(join(S, 'layout.css'), 'utf8');
const components = readFileSync(join(S, 'components.css'), 'utf8');
const modalJsx = readFileSync(join(__dirname, 'Modal.jsx'), 'utf8');
const rewardJsx = readFileSync(join(__dirname, 'RewardPopup.jsx'), 'utf8');
const panel = readFileSync(
    join(__dirname, '..', 'components', 'notifications', 'NotificationPanel.jsx'), 'utf8');

/** Giá trị một token z-index khai trong base.css. */
function token(name) {
    const m = base.match(new RegExp(`--${name}:\\s*(\\d+)`));
    expect(m, `thiếu token --${name}`).toBeTruthy();
    return parseInt(m[1], 10);
}

describe('thứ tự chồng lớp', () => {
    test('bảng Thông báo ĐANG bằng z-index với modal thường', () => {
        // Ghi lại sự thật gây ra lỗi. Nếu sau này ai đó tách hai số này ra thì
        // test đỏ — lúc đó xem lại xem còn cần `aboveOverlay` nữa không.
        const m = components.match(/\.notif-overlay\s*\{[^}]*z-index:\s*(\d+)/);
        expect(m).toBeTruthy();
        expect(parseInt(m[1], 10)).toBe(token('z-modal'));
    });

    test('có lớp riêng để nâng modal lên trên lớp phủ', () => {
        expect(layout).toMatch(
            /#modal-container\.modal-container--above-overlay\s*\{[^}]*z-index:\s*var\(--z-modal-over-overlay\)/);
    });

    test('lớp nâng CAO HƠN cả bảng Thông báo lẫn toast', () => {
        const over = token('z-modal-over-overlay');
        expect(over).toBeGreaterThan(token('z-modal'));
        expect(over).toBeGreaterThan(token('z-notification'));
    });
});

describe('Modal nhận cờ aboveOverlay', () => {
    test('gắn class khi được yêu cầu', () => {
        expect(modalJsx).toMatch(/modal\.aboveOverlay \? ' modal-container--above-overlay' : ''/);
    });

    test('MẶC ĐỊNH không nâng', () => {
        // Nâng toàn cục dễ làm hỏng thứ tự chồng của chỗ khác.
        expect(rewardJsx).toMatch(/aboveOverlay = false/);
    });
});

describe('bảng Thông báo dùng popup, không dùng toast', () => {
    test('nhận LẺ: popup và có nâng lớp', () => {
        const i = panel.indexOf('async function handleClaimGift');
        const body = panel.slice(i, panel.indexOf('async function handleMarkAllRead', i));
        expect(body).toMatch(/showRewardPopup\(/);
        expect(body).toMatch(/aboveOverlay: true/);
    });

    test('nhận TẤT CẢ: cũng popup, cho nhất quán', () => {
        // Trước đây chỗ này là toast nhỏ — nhận cả loạt lại kém long trọng hơn
        // nhận một cái.
        const i = panel.indexOf('async function handleMarkAllRead');
        const body = panel.slice(i, i + 1800);
        expect(body).toMatch(/showRewardPopup\(/);
        expect(body).toMatch(/aboveOverlay: true/);
        expect(body).not.toMatch(/Toast\.success/);
    });

    test('nhận TẤT CẢ gom cả vật phẩm, không chỉ tiền', () => {
        // Bản cũ chỉ cộng coins/gems/xp; quà có vật phẩm thì nhận được nhưng
        // không hiện ra, người dùng không biết mình vừa có gì.
        const i = panel.indexOf('async function handleMarkAllRead');
        const body = panel.slice(i, i + 1800);
        expect(body).toMatch(/totalItems/);
        expect(body).toMatch(/items: totalItems/);
    });

    test('lỗi vẫn báo bằng toast', () => {
        // Thất bại thì popup long trọng là sai chỗ.
        expect(panel).toMatch(/Toast\.error/);
    });
});
