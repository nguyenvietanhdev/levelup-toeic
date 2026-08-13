/**
 * Sửa từ bằng chính form "Thêm từ mới", không mở popup Dịch nhanh.
 *
 * Popup Dịch nhanh chỉ có 4 trường (en/vn/phonetic/synonyms) nên không sửa được
 * `type`, `level`, `example`, `image` — mà đó mới là những thứ hay phải chỉnh
 * sau khi nhập hàng loạt bằng JSON. Form này có đủ 9 trường, và sửa một từ đã có
 * sẵn nghĩa thì cũng không cần gọi API dịch.
 *
 * Ba chỗ hỏng IM LẶNG nếu làm ẩu:
 *
 * 1. Dùng `create` để sửa. Nó là upsert theo (ownerEmail, source, en) — đổi `en`
 *    rồi gọi nó là tạo bản ghi THỨ HAI, bản cũ vẫn nằm đó. Người dùng tưởng đã
 *    đổi tên từ, thực tế nhân đôi nó.
 * 2. `type` nằm ở MỘT trong HAI select (từ đơn / cụm từ). Điền nhầm ô là giá trị
 *    biến mất khỏi form rồi lưu lại thành rỗng.
 * 3. Gọi lại `loadWords(source, panel)` sau khi lưu. Chuyển tab làm onEnterTab
 *    dựng lại danh sách, nên `panel` đang cầm đã bị gỡ khỏi DOM.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

describe('nút sửa dùng form, không dùng popup dịch', () => {
    test('KHÔNG còn gọi popup Dịch nhanh để sửa', () => {
        expect(src).not.toMatch(/_reactOpenTranslate/);
    });

    test('gọi startEdit với bản ghi đầy đủ', () => {
        expect(src).toMatch(/startEdit\(w,/);
    });
});

describe('lưu khi đang sửa', () => {
    test('dùng updateWord, KHÔNG dùng create', () => {
        // create là upsert theo (ownerEmail, source, en): đổi `en` rồi gọi nó là
        // nhân đôi từ chứ không phải đổi tên.
        expect(src).toMatch(/if \(_editing\)[\s\S]{0,400}UploadVocabAPI\.updateWord\(_editing\._id/);
    });

    test('nhánh sửa `return` sớm, không rơi xuống create', () => {
        const i = src.indexOf('UploadVocabAPI.updateWord(_editing._id');
        const j = src.indexOf('UploadVocabAPI.create(', i);
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, j)).toMatch(/return;/);
    });

    test('rời chế độ sửa sau khi lưu xong', () => {
        // Không rời thì lần "Lưu từ" tiếp theo vẫn ghi đè lên từ cũ.
        expect(src).toMatch(/exitEditMode\(\);/);
    });
});

describe('đổ dữ liệu vào form', () => {
    test('điền đủ 9 trường', () => {
        for (const id of ['vocab-en','vocab-vn','vocab-part','vocab-source',
                          'vocab-level','vocab-phonetic','vocab-example',
                          'vocab-synonyms','vocab-image']) {
            // So chuỗi thẳng, KHÔNG dựng regex: `\(` trong template literal bị
            // nuốt thành `(` → mở nhóm regex không đóng → SyntaxError, tức là
            // test đỏ vì chính nó viết sai chứ không phải vì code sai.
            expect(src.includes(`set('${id}'`)).toBe(true);
        }
    });

    test('`type` chọn ĐÚNG một trong hai select theo danh sách', () => {
        // Điền nhầm ô là giá trị biến mất rồi lưu lại thành rỗng.
        expect(src).toMatch(/TYPE1\.includes\(t\)/);
        expect(src).toMatch(/TYPE2\.includes\(t\)/);
    });

    test('KHOÁ source/part khi sửa — route sửa không nhận hai trường đó', () => {
        // Cho sửa mà backend không nhận là hứa suông: người dùng đổi rồi tưởng
        // đã chuyển kho.
        expect(src).toMatch(/lock\('vocab-source'\)/);
        expect(src).toMatch(/lock\('vocab-part'\)/);
    });

    test('nút lưu đổi chữ thành "Cập nhật"', () => {
        expect(src).toMatch(/Cập nhật/);
    });

    test('có nút Huỷ để thoát chế độ sửa', () => {
        expect(src).toMatch(/vocab-cancel-edit/);
    });

    test('tên từ đang sửa được escape', () => {
        // `en` là chữ người dùng nhập, đi thẳng vào innerHTML.
        expect(src).toMatch(/esc\(_editing\.en\)/);
    });
});

describe('sau khi lưu thì quay lại tab quản lý', () => {
    test('KHÔNG gọi loadWords với panel cũ', () => {
        // Chuyển tab dựng lại danh sách nên panel đang cầm đã bị gỡ khỏi DOM.
        expect(src).not.toMatch(/startEdit\(w, \(\) => loadWords/);
    });

    test('chuyển về tab manage', () => {
        expect(src).toMatch(/startEdit\(w,[\s\S]{0,300}detail: 'manage'/);
    });
});

describe('thoát chế độ sửa', () => {
    test('mở khoá lại source/part', () => {
        expect(src).toMatch(/el\.readOnly = false/);
    });

    test('trả nút về "Lưu từ"', () => {
        expect(src).toMatch(/Lưu từ<\/button>|fa-save"><\/i> Lưu từ/);
    });

    test('tự kiểm: đọc được nội dung thật', () => {
        expect(src.length).toBeGreaterThan(10000);
        expect(src).toMatch(/const startEdit/);
    });
});
