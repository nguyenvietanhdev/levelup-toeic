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
    expect(css).toMatch(/#conversation-screen\.active > \.screen-header,\s*#conversation-screen\.active > \.tr-tabs \{\s*flex-shrink: 0;\s*\}/);
});
