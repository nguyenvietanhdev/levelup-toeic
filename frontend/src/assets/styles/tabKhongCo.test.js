/**
 * Màn Hội thoại là cột flex cao đúng 100dvh. Trên điện thoại thanh tab có
 * `overflow-x: auto` → chiều cao tối thiểu về 0 → bị bóp còn ~8px (đo thật ở khổ
 * 390px): tab Luyện / Lịch sử / Vai AI biến mất. Đầu màn và thanh tab phải không co.
 */
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'components.css'), 'utf8');

test('thanh tab và đầu màn Hội thoại không bị cột flex bóp', () => {
    expect(css).toMatch(/#conversation-screen\.active > \.screen-header \{\s*flex-shrink: 0;\s*\}/);
    const i = css.indexOf('.tr-tabs {');
    expect(css.slice(i, css.indexOf('}', i))).toMatch(/flex-shrink: 0;/);
});

test('điện thoại: tab chỉ icon, cùng hàng tên chế độ; nhãn còn ở title/aria-label', () => {
    expect(css).toMatch(/\.screen-header:has\(> \.tr-tabs\) \{ flex-wrap: nowrap; \}/);
    expect(css).toMatch(/\.screen-header \.tr-tab \{ font-size: 0;/);
    expect(css).toMatch(/\.screen-header \.tr-tab i \{ font-size: 17px; \}/);
    const { readFileSync: r } = require('node:fs');
    const man = r(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'components', 'conversation', 'ConversationScreen.jsx'), 'utf8');
    expect(man).toMatch(/<button title="Lịch sử" aria-label="Lịch sử"/);
});

test('điện thoại: icon tab căn giữa theo chiều dọc với tên chế độ', () => {
    expect(css).toMatch(/\.screen-header \.tr-tabs \{ flex: 0 0 auto; gap: 2px; align-self: center; margin-bottom: 0; \}/);
});
