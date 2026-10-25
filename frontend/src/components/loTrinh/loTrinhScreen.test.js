/**
 * Màn "Lộ trình hôm nay": dẫn qua 6 bước với cùng bộ từ, bước nào xong do server đếm.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const man = doc('components', 'loTrinh', 'LoTrinhScreen.jsx');

describe('lối vào', () => {
    test('mục ĐẦU nhóm Luyện tập trong menu, route lo-trinh-screen', () => {
        const menu = doc('layouts', 'SideMenu.jsx');
        const i = menu.indexOf("title: 'Luyện tập'");
        const dau = menu.indexOf('{ label:', i);
        expect(menu.slice(dau, menu.indexOf('}', dau))).toMatch(/label: 'Lộ trình hôm nay'.*screen: 'lo-trinh-screen'/);
        expect(doc('App.jsx')).toMatch(/'lo-trinh-screen': LoTrinhScreen/);
    });
});

describe('màn lộ trình', () => {
    test('đủ 6 bước theo thứ tự tiếp nhận → tạo ra', () => {
        const keys = [...man.slice(man.indexOf('const BUOC = {'), man.indexOf('\n};', man.indexOf('const BUOC = {')))
            .matchAll(/^ {4}'?([a-z-]+)'?: \{/gm)].map((m) => m[1]);
        expect(keys).toEqual(['on-sai', 'hoc-tu', 'nghe', 'doc', 'noi', 'viet-dich']);
    });

    test('không có nút "đánh dấu xong" — tiến độ lấy từ server, tải lại mỗi lần mở màn', () => {
        expect(man).toMatch(/LoTrinhAPI\.get\(\)/);
        expect(man).toMatch(/\}, \[active, isLoggedIn\]\);/);
        expect(man).not.toMatch(/danhDauXong|markDone/);
    });

    test('nêu rõ bước TIẾP THEO (bước đầu tiên chưa xong)', () => {
        expect(man).toMatch(/const tiepTheo = buoc\.find\(\(b\) => !b\.xong\)\?\.key;/);
        expect(man).toMatch(/Tiếp theo/);
    });

    test('chế độ còn khoá Level thì báo "mở ở Level X", không dẫn vào màn bị khoá', () => {
        expect(man).toMatch(/lockInfo\(dich\.feature\)/);
        expect(man).toMatch(/mở ở Level \{khoa\.requiredLevel\}/);
    });

    test('Ôn sai đi qua cùng sự kiện với menu; không có từ đến hạn thì không hiện nút', () => {
        expect(man).toMatch(/EventBus\.emit\(GameEvents\.PRACTICE_REQUESTED, \{ mode \}\)/);
        expect(man).toMatch(/chayCheDo\('review-mistakes'\)/);
        expect(man).toMatch(/if \(b\.boQua\) return null;/);
    });

    test('Viết / Dịch: nút chính theo gợi ý của server, cái còn lại là lựa chọn phụ', () => {
        expect(man).toMatch(/const chinh = b\.goiY === 'dich' \? DICH : VIET;/);
    });

    test('chưa đăng nhập thì mời đăng nhập, không gọi API', () => {
        expect(man).toMatch(/if \(!active \|\| !isLoggedIn\) return undefined;/);
    });
});
