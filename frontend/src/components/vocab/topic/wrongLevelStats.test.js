/**
 * Tab "Từ vựng sai" tự gom phân bố độ khó ở CLIENT.
 *
 * Khác hai tab kia: `/api/wrong-words` trả về nguyên từng từ (kèm `level`), nên
 * không cần đổi backend — gom luôn trong vòng lặp đang có. Nhưng cũng vì thế mà
 * cái bẫy dữ liệu bẩn ("A1", "a2", level rỗng) lặp lại y hệt bên server: so
 * sánh nguyên chuỗi thì tỉ lệ SAI mà không lỗi gì.
 *
 * Test đọc thẳng mã nguồn `useTopics.js` — logic nằm trong một `useCallback`
 * gọi API, tách ra để chạy thật thì phải dựng cả hook.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'useTopics.js'), 'utf8');

/** Thân hàm `loadWrong` — nơi gom từ sai theo source. */
function loadWrongBody() {
    const i = src.indexOf('const loadWrong');
    expect(i, 'không tìm thấy loadWrong').toBeGreaterThan(-1);
    const j = src.indexOf('const selectWrong', i);
    return src.slice(i, j > -1 ? j : i + 2000);
}

describe('gom độ khó cho tab Từ vựng sai', () => {
    const body = loadWrongBody();

    test('có đếm ba mức A/B/C', () => {
        expect(body).toMatch(/levelStats/);
        expect(body).toMatch(/\.a\+\+|a:\s*0/);
        expect(body).toMatch(/lv === 'A'/);
        expect(body).toMatch(/lv === 'B'/);
        expect(body).toMatch(/lv === 'C'/);
    });

    test('lấy CHỮ CÁI ĐẦU và viết hoa — "A1"/"a2" vẫn là nhóm A', () => {
        // Đây là bẫy đã dính ở backend; client gom riêng nên phải chặn lại riêng.
        expect(body).toMatch(/toUpperCase\(\)\[0\]/);
    });

    test('level null/undefined không làm ném lỗi', () => {
        // `w.level` có thể thiếu — `String(...)` trước khi cắt là bắt buộc.
        expect(body).toMatch(/String\(w\.level \|\| ''\)/);
    });

    test('đếm trong CÙNG vòng lặp đang gom wordCount', () => {
        // Lặp thêm một lượt nữa qua cả nghìn từ chỉ để đếm level là thừa.
        const loops = body.match(/for \(const w of list\)/g) || [];
        expect(loops).toHaveLength(1);
    });

    test('vẫn giữ nguyên wordCount và thứ tự sắp xếp', () => {
        expect(body).toMatch(/g\.wordCount\+\+/);
        expect(body).toMatch(/sort\(\(a, b\) => b\.wordCount - a\.wordCount\)/);
    });

    test('levelStats đi kèm mỗi nhóm khi trả ra', () => {
        // `{ source, ...g }` mới mang được cả wordCount lẫn levelStats.
        expect(body).toMatch(/\{ source, \.\.\.g \}/);
    });
});

describe('hai tab kia lấy levelStats từ server', () => {
    test('tab Từ vựng riêng giữ nguyên trường của server', () => {
        // `...t` nên `levelStats` tự đi kèm; đổi sang liệt kê tay là dễ quên.
        expect(src).toMatch(/\.\.\.t, isShared: false/);
        expect(src).toMatch(/\.\.\.t, isShared: true/);
    });
});
