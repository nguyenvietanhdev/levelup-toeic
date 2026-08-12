/**
 * Giao diện chia sẻ trong modal "Từ vựng riêng".
 *
 * Hai ràng buộc của repo này mà chỗ nào dựng HTML bằng chuỗi cũng phải theo:
 *
 * 1. ESCAPE. Email người nhận là chữ NGƯỜI DÙNG NHẬP và nó đi thẳng vào
 *    innerHTML. Không escape là chèn được thẻ.
 * 2. KHÔNG INLINE HANDLER. CSP production đặt `script-src-attr 'none'` nên
 *    onclick trong chuỗi bị chặn — nút hiện ra, bấm không có gì xảy ra, chỉ một
 *    dòng trong console. (noInlineHandlers.test.js đã quét toàn cây, đây là chốt
 *    riêng cho phần vừa thêm.)
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

/** Thân hàm loadShare, cắt tới hàm kế tiếp. */
function loadShareBody() {
    const i = src.indexOf('const loadShare');
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf('const toggleWords', i);
    return src.slice(i, j === -1 ? undefined : j);
}

describe('khung chia sẻ', () => {
    test('tên người nhận được escape trước khi vào innerHTML', () => {
        const b = loadShareBody();
        expect(b).toMatch(/esc\(r\.name\)/);
        expect(b).not.toMatch(/\$\{r\.name\}/);
    });

    test('KHÔNG hiện email người nhận — chia sẻ bằng ID để giữ kín', () => {
        // Chủ bộ từ nhận ra người mình chia sẻ qua TÊN + đuôi ID, không cần email.
        const b = loadShareBody();
        expect(b).not.toMatch(/granteeEmail/);
        expect(b).toMatch(/granteeId/);
    });

    test('ô nhập là ID người chơi, không phải email', () => {
        const b = loadShareBody();
        expect(b).toMatch(/share-id-input/);
        expect(b).not.toMatch(/share-email-input/);
    });

    test('chỉ đường lấy ID ở Bảng xếp hạng', () => {
        // Không nói thì người dùng không biết ID lấy ở đâu ra.
        expect(loadShareBody()).toMatch(/Bảng xếp hạng/);
    });

    test('không dùng inline onclick — CSP production chặn', () => {
        expect(loadShareBody()).not.toMatch(/\son(click|change|submit)\s*=\s*["']/i);
    });

    test('gắn listener bằng addEventListener', () => {
        const b = loadShareBody();
        expect(b).toMatch(/share-add-btn['"]\)\?\.addEventListener/);
        expect(b).toMatch(/share-revoke-btn['"]\)\.forEach/);
    });

    test('Enter trong ô email = bấm Chia sẻ', () => {
        // Gõ xong bấm Enter là phản xạ; không nhận thì người dùng tưởng nút hỏng.
        expect(loadShareBody()).toMatch(/key === 'Enter'/);
    });

    test('thu hồi có hỏi xác nhận — thao tác không hoàn tác được', () => {
        expect(loadShareBody()).toMatch(/window\.confirm\(/);
    });

    test('nói rõ người nhận KHÔNG sửa được bộ của mình', () => {
        // Chủ bộ từ phải biết mình đang cấp quyền tới đâu trước khi bấm.
        expect(loadShareBody()).toMatch(/không sửa\/xoá được/i);
    });

    test('dựng lại danh sách sau khi thêm/thu hồi', () => {
        // Không dựng lại thì bấm xong màn hình không đổi, người dùng bấm tiếp.
        const b = loadShareBody();
        expect((b.match(/loadShare\(source, panel\)/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    test('nút Chia sẻ có trong hàng nguồn và gắn listener theo class', () => {
        expect(src).toMatch(/class="topic-share-btn/);
        expect(src).toMatch(/\.topic-share-btn['"]\)\?\.addEventListener\('click'/);
    });

    test('tự kiểm: đọc được thân hàm thật', () => {
        expect(loadShareBody().length).toBeGreaterThan(800);
        expect(loadShareBody()).toMatch(/UploadVocabAPI\.listSharees/);
    });
});
