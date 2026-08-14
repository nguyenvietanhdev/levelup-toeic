/**
 * Thanh tab popup "Từ vựng riêng" dùng CHUNG kiểu với thanh tab màn Thống kê.
 *
 * Trước đây chỗ này tự đặt style INLINE (`borderRadius: 0`, nền đặc, bốn ô vuông
 * dính liền chạm hai mép) — trong khi màn Thống kê là viên thuốc bo tròn nằm
 * trên một dải nền. Hai thanh tab trong cùng một app trông như hai thời kỳ khác
 * nhau, mà không có gì báo vì cả hai đều "chạy được".
 *
 * Dùng lại class `.stats-tab-nav` / `.stats-tab-btn` thay vì chép giá trị: chép
 * thì sửa một bên là hai bên lệch tiếp, đúng cái vòng lặp vừa thoát ra.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const jsx = readFileSync(join(__dirname, 'TabbedModalBody.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('thanh tab dùng chung kiểu với màn Thống kê', () => {
    test('dùng class chung, không tự đặt style inline', () => {
        expect(jsx).toMatch(/className="stats-tab-nav upload-tab-nav"/);
        expect(jsx).toMatch(/stats-tab-btn \$\{tab === t\.key \? 'active' : ''\}/);
    });

    test('đã bỏ style vuông góc cũ', () => {
        // `borderRadius: 0` là thứ làm bốn tab thành khối vuông dính liền.
        expect(jsx).not.toMatch(/borderRadius:\s*0/);
        expect(jsx).not.toMatch(/borderBottom: '1px solid var\(--border-color\)'/);
    });

    test('kiểu gốc vẫn còn — class mượn phải có thật', () => {
        // Đổi tên/xoá bên Thống kê mà không sửa đây thì thanh tab mất sạch kiểu,
        // thành 4 nút trần.
        expect(css).toMatch(/\.stats-tab-nav\s*\{/);
        expect(css).toMatch(/\.stats-tab-btn\s*\{/);
        expect(css).toMatch(/\.stats-tab-btn\.active\s*\{/);
    });

    test('bo tròn thật sự — dải nền và viên thuốc đều có bán kính', () => {
        const nav = css.match(/\.stats-tab-nav\s*\{([^}]*)\}/)[1];
        const btn = css.match(/\.stats-tab-btn\s*\{([^}]*)\}/)[1];
        expect(nav).toMatch(/border-radius:/);
        expect(btn).toMatch(/border-radius:/);
    });
});

describe('chỉnh riêng cho popup — 4 tab thay vì 3', () => {
    test('nhãn dài co được, không đẩy vỡ hàng', () => {
        // `.stats-tab-btn` mặc định `min-width: max-content`; giữ nguyên thì
        // "Được chia sẻ" đẩy thanh tab tràn ngang.
        const r = css.match(/\.upload-tab-nav \.stats-tab-btn\s*\{([^}]*)\}/);
        expect(r, 'thiếu quy tắc co nhãn cho 4 tab').toBeTruthy();
        expect(r[1]).toMatch(/min-width:\s*0/);
    });

    test('icon KHÔNG co theo (co icon là méo)', () => {
        expect(css).toMatch(/\.upload-tab-nav \.stats-tab-btn i\s*\{[^}]*flex-shrink:\s*0/);
    });

    test('thanh tab tự chừa lề — nó nằm sát mép .modal-body', () => {
        const r = css.match(/\.upload-tab-nav\s*\{([^}]*)\}/);
        expect(r, 'thiếu lề cho thanh tab').toBeTruthy();
        expect(r[1]).toMatch(/margin:/);
    });
});
