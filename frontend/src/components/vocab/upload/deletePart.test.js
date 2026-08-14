/**
 * Nút "Xóa trọn một Part" trong bảng quản lý từ vựng riêng.
 *
 * Lấp khoảng giữa hai mức đã có: xoá TỪNG TỪ (nút ×) và xoá CẢ NGUỒN ("Xóa
 * tất"). Trước đây muốn bỏ một buổi nhập nhầm thì phải bấm × mấy chục lần.
 *
 * Ba chỗ dễ hỏng im lặng:
 *   1. Tên Part do người dùng đặt — có dấu cách ("BUOI 3"), có thể có `/`.
 *      Không `encodeURIComponent` thì `/` cắt URL thành đoạn khác, route không
 *      khớp.
 *   2. Xoá Part cuối cùng → nguồn biến mất. Vẫn gọi `loadWords` sau đó là dựng
 *      bảng vào một thẻ vừa bị gỡ khỏi DOM.
 *   3. Tên Part đi thẳng vào innerHTML → phải escape.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8');
const api = readFileSync(
    join(__dirname, '..', '..', '..', 'api', 'uploadVocab.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Thân hàm deletePart. */
function deletePartBody() {
    const i = src.indexOf('const deletePart =');
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf('const deleteWord =', i);
    return src.slice(i, j > -1 ? j : i + 2500);
}

describe('API client', () => {
    test('có hàm gọi endpoint xoá Part', () => {
        expect(api).toMatch(/deleteSourcePart\(source, part\)/);
        expect(api).toMatch(/method:\s*'DELETE'/);
    });

    test('mã hoá CẢ source lẫn part', () => {
        // Tên Part có dấu cách/`/` — không mã hoá là URL vỡ, route không khớp.
        const i = api.indexOf('deleteSourcePart');
        const block = api.slice(i, i + 400);
        const encodes = block.match(/encodeURIComponent/g) || [];
        expect(encodes.length).toBeGreaterThanOrEqual(2);
    });

    test('gửi kèm token', () => {
        const i = api.indexOf('deleteSourcePart');
        expect(api.slice(i, i + 400)).toMatch(/authHeaders\(\)/);
    });
});

describe('hàng nút Part', () => {
    test('chỉ hiện khi có TỪ HAI Part trở lên', () => {
        // Một Part duy nhất thì "xoá Part" trùng đúng với "Xóa tất" đã có.
        expect(src).toMatch(/parts\.length > 1/);
    });

    test('đếm số từ mỗi Part để hiện lên nút', () => {
        expect(src).toMatch(/partCount\.set\(p,/);
        expect(src).toMatch(/data-n="\$\{n\}"/);
    });

    test('escape tên Part trước khi vào innerHTML', () => {
        // Tên Part là dữ liệu người dùng nhập.
        expect(src).toMatch(/data-part="\$\{esc\(p\)\}"/);
    });
});

describe('luồng xoá', () => {
    const body = deletePartBody();

    test('hỏi xác nhận kèm SỐ TỪ sẽ mất', () => {
        // Thao tác hàng loạt, không hoàn tác được — khác hẳn nút × một từ.
        expect(body).toMatch(/confirm\(/);
        expect(body).toMatch(/\$\{n\}/);
        expect(body).toMatch(/Không thể hoàn tác/);
    });

    test('Part cuối cùng → gỡ thẻ nguồn, KHÔNG dựng lại bảng', () => {
        // `loadWords` sau khi nguồn đã bị gỡ là ghi vào DOM không còn tồn tại.
        expect(body).toMatch(/if \(res\.sourceGone\)/);
        const i = body.indexOf('res.sourceGone');
        const branch = body.slice(i, body.indexOf('}', body.indexOf('return', i)));
        expect(branch).not.toMatch(/loadWords/);
        expect(branch).toMatch(/remove\(\)/);
    });

    test('còn Part khác → cập nhật số từ trên thẻ nguồn', () => {
        // Không cập nhật thì thẻ vẫn hiện con số cũ tới lần mở lại popup.
        expect(body).toMatch(/topicRow\.dataset\.count = newCount/);
        expect(body).toMatch(/res\.deletedCount/);
    });

    test('số từ không tụt xuống âm', () => {
        expect(body).toMatch(/Math\.max\(0,/);
    });

    test('tải lại bảng để hàng Part khớp trạng thái mới', () => {
        expect(body).toMatch(/loadWords\(source, panel\)/);
    });

    test('lỗi thì báo bằng Notification, không nuốt', () => {
        expect(body).toMatch(/Notification\.error/);
    });
});

describe('kiểu hiển thị', () => {
    test('nút Part có style riêng', () => {
        expect(css).toMatch(/\.uv-part-del\s*\{/);
        expect(css).toMatch(/\.uv-part-bar\s*\{/);
    });

    test('chỉ đỏ khi rê chuột — không đỏ thường trực', () => {
        // Đỏ sẵn thì cả hàng trông như đang báo lỗi.
        const base = css.match(/\.uv-part-del\s*\{([^}]*)\}/)[1];
        expect(base).not.toMatch(/#dc2626/);
        expect(css).toMatch(/\.uv-part-del:hover\s*\{[^}]*#dc2626/);
    });

    test('vẫn thấy được ở khổ điện thoại', () => {
        // Cột Part trong bảng bị ẩn ở khổ này, nên hàng nút là chỗ DUY NHẤT còn
        // thấy bộ Part của nguồn.
        //
        // Neo từ `.uv-part-del:hover` trở đi: components.css có NHIỀU khối
        // `max-width: 560px`, lấy cái đầu tiên là cắt trúng khối khác và test đỏ
        // dù CSS đúng.
        const from = css.indexOf('.uv-part-del:hover');
        const i = css.indexOf('@media (max-width: 560px)', from);
        expect(i).toBeGreaterThan(-1);
        expect(css.slice(i, i + 700)).toMatch(/\.uv-part-del/);
    });
});
