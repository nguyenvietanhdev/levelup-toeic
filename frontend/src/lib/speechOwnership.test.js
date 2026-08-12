/**
 * Nhường quyền phím nói giữa thanh nav và popup Dịch nhanh.
 *
 * Vấn đề: cả hai cùng bắt phím Shift để nói. Popup mở ra mà giữ Shift thì chữ
 * chui vào ô tìm kiếm ở nav SAU LƯNG người dùng — nội dung hiện ở một nơi họ
 * không nhìn, popup thì trống.
 *
 * Cách giải KHÔNG phải thêm điều kiện ở mỗi bên (rồi bên thứ ba lại quên), mà là
 * NHƯỜNG QUYỀN: ai mở thì đăng ký `window._speechOwner`, bên còn lại thấy có chủ
 * thì đứng im.
 *
 * Điểm mấu chốt phải kiểm bằng SỞ HỮU chứ không bằng focus: popup vừa mở thì
 * `document.activeElement` vẫn là <body> (ô gốc không autoFocus), nên kiểm focus
 * KHÔNG phát hiện được gì và xung đột vẫn xảy ra.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

/** Bản sao `busyElsewhere()` của TopNav. */
function navShouldStandDown() {
    if (window._speechOwner) return true;
    const el = document.activeElement;
    if (!el || el.id === 'search-input') return false;
    return !!(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

beforeEach(() => {
    document.body.innerHTML = '<input id="search-input" />';
    delete window._speechOwner;
});
afterEach(() => { delete window._speechOwner; });

describe('nav nhường quyền khi có chủ khác', () => {
    test('không ai chiếm → nav nhận phím', () => {
        expect(navShouldStandDown()).toBe(false);
    });

    test('popup chiếm quyền → nav đứng im, KỂ CẢ khi chưa focus vào ô nào', () => {
        // Đây là ca mà kiểm-theo-focus bỏ sót: popup vừa mở, activeElement là
        // <body>, ô gốc chưa được focus. Không có cờ sở hữu thì nav vẫn nhận phím
        // và ghi chữ vào ô tìm kiếm sau lưng.
        window._speechOwner = 'translate-modal';
        expect(document.activeElement.tagName).toBe('BODY');
        expect(navShouldStandDown()).toBe(true);
    });

    test('popup đóng → nav nhận phím trở lại', () => {
        window._speechOwner = 'translate-modal';
        delete window._speechOwner;
        expect(navShouldStandDown()).toBe(false);
    });

    test('đang gõ ở ô nhập khác thì nav vẫn đứng im (lớp cũ còn nguyên)', () => {
        document.body.innerHTML = '<textarea id="ghi-chu"></textarea>';
        document.getElementById('ghi-chu').focus();
        expect(navShouldStandDown()).toBe(true);
    });

    test('con trỏ ở CHÍNH ô tìm kiếm thì nav vẫn nhận — đó là nơi chữ sẽ hiện', () => {
        document.getElementById('search-input').focus();
        expect(navShouldStandDown()).toBe(false);
    });
});

describe('trả quyền cho đúng chủ trước đó', () => {
    test('lồng hai lớp: lớp trong đóng thì trả về lớp ngoài, không xoá trắng', () => {
        // Xoá trắng (delete) thay vì khôi phục thì đóng popup con là nav giành lại
        // phím trong khi popup cha vẫn đang mở.
        window._speechOwner = 'outer';
        const prev = window._speechOwner;
        window._speechOwner = 'inner';
        window._speechOwner = prev;              // cleanup của lớp trong
        expect(window._speechOwner).toBe('outer');
        expect(navShouldStandDown()).toBe(true);
    });
});

/** Chốt bằng nguồn thật — phần trên chép lại logic nên tự nó luôn nhất quán. */
describe('nguồn thật có nối đúng', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const strip = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

    const nav = strip('layouts/TopNav.jsx');
    const modal = strip('components/translate/TranslateModal.jsx');

    test('nav kiểm cờ sở hữu TRƯỚC khi kiểm focus', () => {
        const i = nav.indexOf('_speechOwner');
        const j = nav.indexOf('document.activeElement', i);
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
    });

    test('popup đăng ký và TRẢ LẠI quyền lúc dọn dẹp', () => {
        expect(modal).toMatch(/window\._speechOwner\s*=\s*['"]translate-modal['"]/);
        expect(modal).toMatch(/const prevOwner = window\._speechOwner/);
        expect(modal).toMatch(/window\._speechOwner\s*=\s*prevOwner/);
    });

    test('cả hai đều xoá chữ cũ trước mỗi phiên nói', () => {
        // Không xoá thì chữ mới nối đuôi chữ cũ thành câu vô nghĩa.
        expect(nav).toMatch(/setSearchQuery\(''\);?\s*\n\s*speechRef\.current\?\.start\(\)/);
        expect(modal).toMatch(/setSrcDraft\(''\);\s*s\.start\(\)/);
    });

    test('tự kiểm: đọc được nội dung thật', () => {
        expect(nav.length).toBeGreaterThan(5000);
        expect(modal.length).toBeGreaterThan(5000);
    });
});
