/**
 * Phần "Quản lý từ vựng" phải LUÔN có đường vào — ở mọi khổ màn hình.
 *
 * Nó từng có HAI lối vào: một tab trên thanh tab của popup, và nút "Quản lý từ
 * vựng" ở header. Vì có tab đỡ nên responsive.css ẩn hẳn nút header ở khổ điện
 * thoại. Nay tab đã bỏ, nút header là lối vào DUY NHẤT — ẩn nó đi là mất hẳn
 * tính năng trên điện thoại, mà không có lỗi nào báo cả.
 *
 * Đây đúng là loại hỏng im lặng: bỏ tab và ẩn nút là hai file khác nhau, sửa
 * một chỗ quên chỗ kia thì trên máy tính vẫn chạy ngon.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8');
const resp = readFileSync(
    join(__dirname, '..', '..', '..', 'assets', 'styles', 'responsive.css'), 'utf8');

/** Danh sách `tabs:` truyền cho TabbedModalBody. */
function tabList() {
    const i = src.indexOf('const contentJsx = createElement(TabbedModalBody');
    expect(i, 'không tìm thấy nơi dựng thanh tab').toBeGreaterThan(-1);
    const start = src.indexOf('tabs: [', i);
    const end = src.indexOf('],', start);
    return src.slice(start, end);
}

describe('thanh tab của popup "Từ vựng riêng"', () => {
    test('KHÔNG còn tab "Quản lý"', () => {
        expect(tabList()).not.toMatch(/key: 'manage'/);
    });

    test('bốn tab còn lại vẫn nguyên', () => {
        const t = tabList();
        for (const key of ['add', 'json', 'share', 'received']) {
            expect(t, `mất tab ${key}`).toMatch(new RegExp(`key: '${key}'`));
        }
    });
});

describe('trạng thái `manage` vẫn sống, chỉ là không nằm trên thanh tab', () => {
    test('vẫn dựng được nội dung tab quản lý', () => {
        // Bỏ tab khỏi thanh mà xoá luôn nhánh render thì nút header mở ra trang
        // trắng.
        expect(src).toMatch(/manageTabHtml\(\)/);
        expect(src).toMatch(/t === 'manage'.*loadMyTopics\(\)|else if \(t === 'manage'\) loadMyTopics\(\)/);
    });

    test('mở thẳng vào quản lý (popup Dịch nhanh) vẫn chạy', () => {
        expect(src).toMatch(/initialTab:[\s\S]{0,80}'manage'/);
    });

    test('nút header vẫn phát sự kiện đổi tab', () => {
        expect(src).toMatch(/upload-tab-manage[\s\S]{0,400}detail: 'manage'/);
    });
});

describe('nút "Quản lý từ vựng" ở header không bị ẩn trên điện thoại', () => {
    test('responsive.css KHÔNG ẩn #upload-tab-manage', () => {
        // Đây là bảo hiểm chính: tab đã bỏ nên nút này là lối vào duy nhất.
        // Tìm mọi khối quy tắc có nhắc tới id đó và đặt `display: none`.
        const blocks = resp.match(/[^}]*#upload-tab-manage[^{]*\{[^}]*\}/g) || [];
        for (const b of blocks) {
            expect(b, `nút quản lý bị ẩn:\n${b}`).not.toMatch(/display:\s*none/);
        }
    });

    test('quy tắc thu nhỏ thanh tab vẫn chừa nút header ra', () => {
        // `[id^="upload-tab-"]` quét trúng cả nút header (cùng tiền tố id).
        // Không giới hạn trong .modal-body thì nút mất icon và co chữ theo tab.
        const m = resp.match(/([^}\n]*\[id\^="upload-tab-"\][^{]*)\{/g) || [];
        expect(m.length, 'không còn quy tắc nào cho thanh tab?').toBeGreaterThan(0);
        for (const sel of m) {
            expect(sel, `quy tắc quét cả nút header: ${sel}`).toMatch(/\.modal-body/);
        }
    });
});
