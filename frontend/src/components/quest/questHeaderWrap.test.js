/**
 * Tên nhiệm vụ không được vỡ thành mỗi từ một dòng.
 *
 * `.quest-header` là `space-between`: tên bên trái, cụm phần thưởng bên phải.
 * Nhiệm vụ nhiều thưởng ("🪙 750 · ⭐ 380 XP · 💎 13 · 🎴 Thẻ hồi · ⚡ x2") có
 * hàng thưởng dài gần bằng cả thẻ, mà `.quest-reward` lại `white-space: nowrap`
 * và không bị chặn co — nó giành gần hết bề ngang, ép `.quest-title` còn vài ký
 * tự. Kết quả: "50 ván trong tháng" xuống dòng thành "50 / ván / trong / tháng".
 *
 * Hỏng IM LẶNG: chỉ lộ ra ở những nhiệm vụ có nhiều loại thưởng, nên thẻ bên
 * cạnh vẫn trông bình thường.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/**
 * Bản quy tắc CUỐI CÙNG trong file — components.css định nghĩa `.quest-header`
 * / `.quest-title` / `.quest-reward` tới HAI lần (dòng ~299 và ~6471). Cùng độ
 * cụ thể thì cái viết sau thắng, nên phải kiểm bản sau; đọc bản đầu là kiểm một
 * thứ không có tác dụng.
 */
function lastRule(selector) {
    const re = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
    let m, last = null;
    while ((m = re.exec(css)) !== null) last = m[1];
    expect(last, `không tìm thấy ${selector}`).toBeTruthy();
    return last;
}

describe('hàng tiêu đề nhiệm vụ', () => {
    test('cho phép xuống dòng khi hết chỗ', () => {
        // Ép chung một hàng là nguồn gốc của việc bóp tên.
        expect(lastRule('.quest-header')).toMatch(/flex-wrap:\s*wrap/);
    });

    test('tên nhiệm vụ được ưu tiên chỗ, không co vô hạn', () => {
        const r = lastRule('.quest-title');
        // `flex-basis` đủ lớn để một cụm từ tiếng Việt đứng trọn.
        const basis = parseInt(r.match(/flex:\s*\d+\s+\d+\s+(\d+)%/)?.[1] || '0', 10);
        expect(basis).toBeGreaterThanOrEqual(50);
        expect(r).toMatch(/min-width:\s*0/);
    });

    test('cụm thưởng chỉ lấy chỗ CÒN THỪA', () => {
        const r = lastRule('.quest-reward');
        // `flex: 0 1 auto` — không giành phần của tên nữa.
        expect(r).toMatch(/flex:\s*0 1 auto/);
        expect(r).toMatch(/min-width:\s*0/);
    });

    test('cụm thưởng xuống dòng được, nhưng từng mục vẫn liền', () => {
        const r = lastRule('.quest-reward');
        // Giữ `nowrap` để "380 XP" không bị cắt làm đôi giữa số và chữ…
        expect(r).toMatch(/white-space:\s*nowrap/);
        // …còn cả cụm thì được rớt xuống hàng dưới.
        expect(r).toMatch(/flex-wrap:\s*wrap/);
    });

    test('icon nhiệm vụ không co lại', () => {
        expect(lastRule('.quest-icon')).toMatch(/flex-shrink:\s*0/);
    });
});
