/**
 * Thanh điều hướng ẩn khi cuộn XUỐNG, hiện lại khi cuộn LÊN.
 *
 * Ba chỗ dễ hỏng im lặng:
 *   1. Ẩn cả khi ĐANG GÕ TÌM — ô nhập nằm trong chính thanh này, ẩn đi là người
 *      dùng mất chỗ gõ giữa chừng mà không hiểu vì sao.
 *   2. Chép hook thành hai bản (thanh trạng thái trên + nav dưới) → hai ngưỡng
 *      lệch nhau, hai thanh ẩn/hiện so le, nhìn như giao diện giật.
 *   3. Nghe `scroll` mà không gom qua requestAnimationFrame → sự kiện bắn dày
 *      đặc, mỗi cái một lượt setState.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const hook = strip(readFileSync(join(__dirname, 'useHideOnScrollDown.js'), 'utf8'));
const nav = strip(readFileSync(join(__dirname, 'TopNav.jsx'), 'utf8'));
const status = strip(readFileSync(join(__dirname, 'StatusBar.jsx'), 'utf8'));

describe('hook dùng chung', () => {
    test('cả nav lẫn thanh trạng thái đều dùng MỘT hook', () => {
        // Hai bản chép sẽ lệch ngưỡng nhau; người dùng thấy hai thanh ẩn/hiện
        // so le thì tưởng giao diện giật.
        expect(nav).toMatch(/import \{ useHideOnScrollDown \} from '\.\/useHideOnScrollDown\.js'/);
        expect(status).toMatch(/import \{ useHideOnScrollDown \} from '\.\/useHideOnScrollDown\.js'/);
    });

    test('StatusBar KHÔNG còn giữ bản sao của hook', () => {
        expect(status).not.toMatch(/function useHideOnScrollDown/);
        expect(status).not.toMatch(/const HIDE_AFTER/);
    });

    test('chỉ ẩn sau khi đã cuộn qua một ngưỡng', () => {
        // Ẩn từ pixel đầu tiên là thanh chớp tắt theo từng cú lăn chuột.
        expect(hook).toMatch(/y > HIDE_AFTER && diff > 0/);
    });

    test('bỏ qua rung lặt vặt', () => {
        // Màn cảm ứng nảy vài pixel không được tính là "đổi hướng".
        expect(hook).toMatch(/Math\.abs\(diff\) < DELTA/);
    });

    test('gom sự kiện qua requestAnimationFrame', () => {
        expect(hook).toMatch(/requestAnimationFrame\(update\)/);
        expect(hook).toMatch(/\{ passive: true \}/);
    });

    test('gỡ listener khi tháo khỏi cây', () => {
        expect(hook).toMatch(/removeEventListener\('scroll', onScroll\)/);
    });
});

describe('nav', () => {
    test('KHÔNG ẩn khi đang gõ tìm', () => {
        // Ô nhập nằm trong chính thanh này. Ẩn đi giữa chừng là mất chỗ gõ.
        // `searchExpanded` cũng phải chặn: ô mở bằng cử chỉ GIỮ không có tiêu
        // điểm, thiếu vế đó là đang nói mà nav trượt mất khỏi màn.
        expect(nav).toMatch(/navHidden && !searchFocused && !searchExpanded \? 'nav-hidden' : ''/);
    });

    test('class trượt ẩn được gắn lên chính thanh nav', () => {
        expect(nav).toMatch(/'top-nav',/);
        expect(nav).toMatch(/const navHidden = useHideOnScrollDown\(\)/);
    });
});
