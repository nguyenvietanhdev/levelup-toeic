/**
 * Hộp thư đến: bộ từ người khác chia sẻ, CHỜ mình duyệt.
 *
 * Trước đây chia sẻ là bộ từ hiện NGAY trong danh sách chọn đề của người nhận —
 * ai biết ID cũng đẩy được bộ từ vào màn hình người khác. Giờ phải tích chọn rồi
 * bấm Nhận.
 *
 * Ba chỗ dễ hỏng im lặng:
 *   1. `return` sớm khi người dùng CHƯA có bộ từ nào của mình → hộp thư đến
 *      không bao giờ hiện, dù họ vẫn được người khác chia sẻ.
 *   2. Nút "Bỏ qua" nằm trong <label> — không chặn sự kiện thì bấm nó cũng tích
 *      luôn ô checkbox.
 *   3. Nút Nhận không cho biết đang chọn mấy cái, bấm khi chưa chọn thì không có
 *      gì xảy ra và cũng không nói vì sao.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

function inboxBody() {
    const i = src.indexOf('const loadShareInbox');
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf('const loadSharePeople', i);
    return src.slice(i, j === -1 ? undefined : j);
}

describe('hộp thư đến', () => {
    test('gọi API danh sách chờ duyệt', () => {
        expect(inboxBody()).toMatch(/UploadVocabAPI\.pendingShares\(\)/);
    });

    test('mỗi lời mời có checkbox', () => {
        expect(inboxBody()).toMatch(/type="checkbox" class="inbox-check"/);
    });

    test('gửi CẶP (ownerEmail, source) khi nhận — không chỉ tên bộ', () => {
        // Hai người cùng chia sẻ bộ trùng tên thì thiếu ownerEmail là duyệt nhầm.
        expect(inboxBody()).toMatch(/ownerEmail: c\.dataset\.owner, source: c\.dataset\.source/);
    });

    test('nút Nhận hiện SỐ đang chọn và tắt khi chưa chọn gì', () => {
        const b = inboxBody();
        expect(b).toMatch(/Nhận \(\$\{n\}\)/);
        expect(b).toMatch(/btn\.disabled = n === 0/);
    });

    test('bộ đã hết hạn thì KHÔNG cho tích', () => {
        // Nhận về cũng chẳng có từ nào.
        expect(inboxBody()).toMatch(/r\.expired \? 'disabled' : ''/);
    });

    test('bộ hết hạn VẪN hiện, không lọc bỏ', () => {
        // Biến mất im lặng thì người nhận không hiểu lời mời đi đâu.
        expect(inboxBody()).toMatch(/đã hết hạn/);
        expect(inboxBody()).not.toMatch(/\.filter\(r => !r\.expired\)/);
    });

    test('nút Bỏ qua CHẶN sự kiện — nó nằm trong <label>', () => {
        const b = inboxBody();
        expect(b).toMatch(/e\.preventDefault\(\)/);
        expect(b).toMatch(/e\.stopPropagation\(\)/);
    });

    test('Bỏ qua có hỏi xác nhận', () => {
        expect(inboxBody()).toMatch(/window\.confirm\(/);
    });

    test('dựng lại danh sách sau khi nhận / bỏ qua', () => {
        const b = inboxBody();
        expect((b.match(/loadShareInbox\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    test('tên chủ sở hữu và tên bộ đều được escape', () => {
        const b = inboxBody();
        expect(b).toMatch(/esc\(r\.ownerName\)/);
        expect(b).toMatch(/esc\(sourceLabel\(r\.source\)\)/);
    });

    test('CHƯA có bộ từ nào của mình thì VẪN hiện hộp thư đến', () => {
        // `return` sớm ở nhánh đó là người mới không bao giờ thấy lời mời.
        const i = src.indexOf('Bạn chưa có bộ từ nào để chia sẻ');
        const j = src.indexOf('return;', i);
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, j)).toMatch(/loadShareInbox\(\)/);
    });

    test('tự kiểm: đọc được thân hàm thật', () => {
        expect(inboxBody().length).toBeGreaterThan(1500);
    });
});
