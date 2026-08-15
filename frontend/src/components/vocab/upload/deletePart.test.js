/**
 * "Xóa chọn lọc" trong bảng quản lý từ vựng riêng.
 *
 * Thay cho hàng nút-mỗi-Part của bản trước: nút-mỗi-Part chỉ lọc được đúng MỘT
 * tiêu chí, muốn bỏ "mọi danh từ mức HSK1 trong BUỔI 3" thì lại phải bấm × từng
 * dòng. Popup này lọc theo nhiều điều kiện AND, cùng kiểu "Xóa chọn lọc" bên
 * admin.
 *
 * Bốn chỗ dễ hỏng im lặng:
 *   1. Ô giá trị là <select> đổ từ dữ liệu THẬT, không phải ô gõ tự do — gõ tay
 *      sai một chữ ("buoi 3" vs "BUỔI 3") là khớp 0 từ mà vẫn báo thành công.
 *   2. Không điều kiện nào → `deleteMany({})` quét sạch cả nguồn.
 *   3. Xóa hết sạch → nguồn biến mất; dựng lại bảng là ghi vào thẻ đã bị gỡ.
 *   4. `part`/`level` lưu CHỮ HOA lúc nhập, phải chuẩn hoá trước khi so khớp.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8');
const api = readFileSync(
    join(__dirname, '..', '..', '..', 'api', 'uploadVocab.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
const controller = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'backend', 'controllers', 'uploadController.js'), 'utf8');

/** Thân hàm dựng popup. */
function modalBody() {
    const i = src.indexOf('const showFilterDeleteModal');
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf('const deleteWord =', i);
    return src.slice(i, j > -1 ? j : i + 8000);
}

describe('API client', () => {
    test('có hàm gọi endpoint lọc-xóa', () => {
        expect(api).toMatch(/filterDeleteSource\(source, filters\)/);
        expect(api).toMatch(/method:\s*'POST'/);
    });

    test('mã hoá tên nguồn trong URL', () => {
        const i = api.indexOf('filterDeleteSource');
        expect(api.slice(i, i + 400)).toMatch(/encodeURIComponent\(source\)/);
    });
});

describe('popup lọc', () => {
    const body = modalBody();

    test('giá trị là <select> đổ từ dữ liệu thật, không phải ô gõ tay', () => {
        // Gõ tay sai một chữ là khớp 0 từ — báo thành công mà chẳng xóa gì.
        expect(body).toMatch(/const valuesOf = \(field\)/);
        expect(body).toMatch(/uv-fd-value/);
        expect(body).not.toMatch(/class="uv-fd-value"[^>]*type="text"/);
    });

    test('hiện SỐ TỪ của mỗi giá trị để biết sắp xóa bao nhiêu', () => {
        expect(body).toMatch(/\$\{esc\(v\)\} \(\$\{n\}\)/);
    });

    test('đếm trước ở client — không phải gọi server để xem', () => {
        expect(body).toMatch(/const updatePreview/);
        expect(body).toMatch(/filters\.every\(/);
    });

    test('chưa chọn trường thì ô giá trị bị khoá', () => {
        expect(body).toMatch(/valSel\.disabled = true/);
    });

    test('chặn khi không có điều kiện nào', () => {
        // Không chặn thì server nhận mảng rỗng → nguy cơ quét sạch nguồn.
        expect(body).toMatch(/if \(!filters\.length\)/);
    });

    test('hỏi xác nhận, nói rõ không hoàn tác được', () => {
        expect(body).toMatch(/confirm\(/);
        expect(body).toMatch(/Không thể hoàn tác/);
    });

    test('bấm nền ngoài mới đóng, bấm trong hộp thì không', () => {
        expect(body).toMatch(/if \(e\.target === modal\) close\(\)/);
    });
});

describe('sau khi xóa', () => {
    const body = modalBody();

    test('xóa sạch nguồn → gỡ thẻ, KHÔNG dựng lại bảng', () => {
        expect(body).toMatch(/if \(res\.sourceGone\)/);
        const i = body.indexOf('res.sourceGone');
        const branch = body.slice(i, body.indexOf('return;', i));
        expect(branch).not.toMatch(/loadWords/);
        expect(branch).toMatch(/remove\(\)/);
    });

    test('còn từ → cập nhật số đếm trên thẻ nguồn', () => {
        expect(body).toMatch(/topicRow\.dataset\.count = newCount/);
        expect(body).toMatch(/Math\.max\(0,/);
    });

    test('tải lại bảng cho khớp trạng thái mới', () => {
        expect(body).toMatch(/loadWords\(source, panel\)/);
    });
});

describe('backend', () => {
    test('chỉ cho lọc theo các trường trong danh sách trắng', () => {
        // Không giới hạn thì lọc được cả `ownerEmail` — chạm sang dữ liệu người khác.
        expect(controller).toMatch(/FILTER_DELETE_FIELDS/);
        expect(controller).toMatch(/không được phép lọc/);
    });

    test('ghim ownerEmail + source, không cho vượt ra ngoài', () => {
        const i = controller.indexOf('exports.filterDeleteMySource');
        const body = controller.slice(i, i + 3000);
        expect(body).toMatch(/ownerEmail: email, source/);
    });

    test('từ chối khi không có điều kiện nào', () => {
        const i = controller.indexOf('exports.filterDeleteMySource');
        const body = controller.slice(i, i + 3000);
        expect(body).toMatch(/Object\.keys\(conditions\)\.length === 0/);
        expect(body).toMatch(/status\(400\)/);
    });

    test('chuẩn hoá CHỮ HOA cho part và level', () => {
        // Hai trường này được `upper()` lúc nhập; không chuẩn hoá là khớp 0 từ.
        const i = controller.indexOf('exports.filterDeleteMySource');
        const body = controller.slice(i, i + 3000);
        expect(body).toMatch(/field === 'part' \|\| field === 'level'/);
        expect(body).toMatch(/upper\(v\)/);
    });

    test('báo `sourceGone` khi xóa hết sạch', () => {
        const i = controller.indexOf('exports.filterDeleteMySource');
        const body = controller.slice(i, i + 3000);
        expect(body).toMatch(/sourceGone/);
    });
});

describe('kiểu hiển thị', () => {
    test('nút mở popup và popup đều có style', () => {
        expect(css).toMatch(/\.uv-filter-del-btn\s*\{/);
        expect(css).toMatch(/\.uv-fd-overlay\s*\{/);
        expect(css).toMatch(/\.uv-fd-box\s*\{/);
    });

    test('không để lại CSS mồ côi của hàng nút Part cũ', () => {
        expect(css).not.toMatch(/\.uv-part-del\s*\{/);
        expect(css).not.toMatch(/\.uv-part-bar-label\s*\{/);
    });

    test('mobile: hai cột thành một', () => {
        // Trên màn 360px, "Trường" và "Giá trị" cạnh nhau thì mỗi select ~140px,
        // tên Part dài bị cắt.
        const i = css.indexOf('@media (max-width: 560px)', css.indexOf('.uv-filter-del-btn'));
        expect(i).toBeGreaterThan(-1);
        expect(css.slice(i, i + 800)).toMatch(/\.uv-fd-row\s*\{[^}]*grid-template-columns:\s*1fr/);
    });
});
