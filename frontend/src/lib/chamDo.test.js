/**
 * Chấm đỏ trên menu.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Chấm "Lộ trình hôm nay" không hiện lại khi sang ngày mới.
 *   2. Chấm đeo bám: đã mở màn rồi vẫn còn chấm.
 *   3. Nhóm đang thu giấu mất chấm của mục bên trong.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chamTheoMan, danhDauDaXem } from './chamDo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf8');

const D = {
    ngay: '2026-10-26', tuan: '2026-10-26',
    dangDo: { viet: true, dich: false, doc: true, nghe: true, chat: false, hoiThoai: true },
    loTrinh: true, tongKet: true,
};

beforeEach(() => { localStorage.clear(); });

describe('cờ chấm theo màn', () => {
    test('bài làm dở → chấm đúng mục', () => {
        const c = chamTheoMan(D);
        expect(c['essay-screen']).toBe(true);
        expect(c['translation-screen']).toBe(false);
        expect(c['reading-screen']).toBe(true);
        expect(c['listening-screen']).toBe(true);
        expect(c['conversation-screen']).toBe(false);
        expect(c['voice-conversation-screen']).toBe(true);
    });

    test('Lộ trình: mở trong ngày thì ẩn; sang ngày mới (server báo ngày khác) thì hiện lại', () => {
        expect(chamTheoMan(D)['lo-trinh-screen']).toBe(true);
        danhDauDaXem('lo-trinh', '2026-10-26');
        expect(chamTheoMan(D)['lo-trinh-screen']).toBe(false);
        expect(chamTheoMan({ ...D, ngay: '2026-10-27' })['lo-trinh-screen']).toBe(true);
        // Đã xong đủ bước thì không chấm dù chưa mở.
        localStorage.clear();
        expect(chamTheoMan({ ...D, loTrinh: false })['lo-trinh-screen']).toBe(false);
    });

    test('Tiến bộ: mở trong tuần thì ẩn; tuần mới hiện lại', () => {
        expect(chamTheoMan(D)['tien-bo-screen']).toBe(true);
        danhDauDaXem('tien-bo', '2026-10-26');
        expect(chamTheoMan(D)['tien-bo-screen']).toBe(false);
        expect(chamTheoMan({ ...D, tuan: '2026-11-02' })['tien-bo-screen']).toBe(true);
    });

    test('không có dữ liệu → không chấm gì', () => {
        expect(chamTheoMan(null)).toEqual({});
    });
});

describe('gắn vào giao diện', () => {
    test('mục menu có chấm; nhóm đang thu cũng tính chấm của mục bên trong', () => {
        const menu = doc('layouts', 'SideMenu.jsx');
        expect(menu).toMatch(/const chamCua = \(it\) => !!\(it\.screen && badges\.cham\?\.\[it\.screen\]\);/);
        expect(menu).toMatch(/\|\| chamCua\(it\)\);/);
        expect(menu).toMatch(/\{!locked && chamCua\(item\) && \(/);
    });

    test('nút menu trên thanh trên cũng có chấm', () => {
        expect(doc('layouts', 'TopNav.jsx')).toMatch(/Object\.values\(menuBadges\.cham \|\| \{\}\)\.some\(Boolean\)/);
    });

    test('mở Lộ trình / Tiến bộ thì đánh dấu đã xem theo mốc server (giờ VN)', () => {
        expect(doc('components', 'loTrinh', 'LoTrinhScreen.jsx')).toMatch(/danhDauDaXem\('lo-trinh', d\?\.ngay\)/);
        expect(doc('components', 'tienBo', 'TienBoScreen.jsx')).toMatch(/danhDauDaXem\('tien-bo', d\?\.tuan\)/);
        expect(doc('layouts', 'useMenuBadges.js')).toMatch(/\/api\/tien-bo\/cham-do/);
    });
});
