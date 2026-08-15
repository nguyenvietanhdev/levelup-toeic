/**
 * Dải "Nhắc ôn tập" ở đầu màn Trang chủ, khổ điện thoại.
 *
 * Bốn phần tử trên MỘT hàng (chuông · chữ · nút "Luyện tập ngay" · nút ×) không
 * vừa màn 360px. Nút CTA và nút × đều `flex-shrink: 0`, nên phần bị bóp là khối
 * CHỮ — câu "Học một chút hôm nay để bắt đầu chuỗi streak nào!" vỡ thành từng
 * chữ một dòng.
 *
 * Bản cũ chỉ đặt `flex-wrap: wrap`. Cho xuống dòng thì hết tràn, nhưng nút ×
 * trôi xuống nằm cạnh nút CTA — mất chỗ đứng cố định ở góc trên phải, mỗi lần
 * muốn đóng lại phải tìm.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
const jsx = readFileSync(join(__dirname, 'HomeScreen.jsx'), 'utf8');

/** Khối @media chứa quy tắc mobile của dải nhắc. */
const mobile = (() => {
    const anchor = css.indexOf('.practice-reminder-close:hover');
    const i = css.indexOf('@media (max-width: 600px)', anchor);
    expect(i).toBeGreaterThan(-1);
    let depth = 0;
    for (let j = css.indexOf('{', i); j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}' && --depth === 0) return css.slice(i, j + 1);
    }
    throw new Error('Khối @media không đóng ngoặc');
})();

describe('bố cục hai hàng ở khổ điện thoại', () => {
    test('dùng lưới có vùng đặt tên, không chỉ flex-wrap', () => {
        const r = mobile.match(/\.practice-reminder\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/display:\s*grid/);
        expect(r[1]).toMatch(/grid-template-areas/);
    });

    test('nút × giữ nguyên góc trên phải, KHÔNG rơi xuống cạnh CTA', () => {
        // Đây là điểm khác biệt so với bản `flex-wrap` cũ.
        expect(mobile).toMatch(/"icon text close"/);
        expect(mobile).toMatch(/\.practice-reminder-close\s*\{[^}]*grid-area:\s*close/);
    });

    test('nút CTA chiếm trọn hàng dưới', () => {
        expect(mobile).toMatch(/"cta\s+cta\s+cta"/);
        const r = mobile.match(/\.practice-reminder-cta\s*\{([^}]*)\}/);
        expect(r[1]).toMatch(/width:\s*100%/);
        expect(r[1]).toMatch(/justify-content:\s*center/);
    });

    test('chữ dài xuống dòng được', () => {
        // `min-width: 0` ở bản gốc chỉ cho HỘP co, không ngăn CHỮ tràn.
        expect(mobile).toMatch(/overflow-wrap:\s*anywhere/);
    });
});

describe('bản desktop giữ nguyên một hàng', () => {
    test('vẫn là flex ngang', () => {
        const base = css.slice(0, css.indexOf('.practice-reminder-close:hover'));
        const r = base.match(/\.practice-reminder\s*\{([^}]*)\}/);
        expect(r[1]).toMatch(/display:\s*flex/);
        expect(r[1]).toMatch(/align-items:\s*center/);
    });
});

describe('markup khớp với các vùng lưới', () => {
    test('đủ bốn phần tử mà CSS nhắm tới', () => {
        // Đổi tên class trong JSX mà quên CSS thì lưới mất một ô, bố cục lệch
        // hẳn — mà trên desktop vẫn trông bình thường.
        // Khớp theo TÊN CLASS chứ không phải nguyên chuỗi `className="..."`:
        // icon dùng class ghép (`fas fa-bell practice-reminder-icon`).
        for (const cls of [
            'practice-reminder-icon',
            'practice-reminder-text',
            'practice-reminder-cta',
            'practice-reminder-close',
        ]) {
            expect(jsx, `thiếu class ${cls}`).toMatch(new RegExp(`\\b${cls}\\b`));
        }
    });
});
