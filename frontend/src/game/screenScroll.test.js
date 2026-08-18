/**
 * Nhớ vị trí cuộn giữa các màn + bấm hai lần để lên đầu trang.
 *
 * Vì sao cần: các màn KHÔNG unmount khi rời đi, chúng chỉ bị `display: none`.
 * Trang co lại nên trình duyệt kéo `window.scrollY` về 0 — quay lại trang chủ
 * là đứng ở đầu, dù trước đó đã cuộn xuống giữa 12 thẻ chế độ. Thoát luyện tập
 * rồi phải cuộn tìm lại thẻ vừa bấm là mất chỗ thật sự.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { luuViTri, docViTri, quenViTri, khoiPhucCuon } from './screenScroll.js';

const ctx = readFileSync(join(__dirname, 'GameContext.jsx'), 'utf8');
const nav = readFileSync(join(__dirname, '..', 'layouts', 'TopNav.jsx'), 'utf8');

beforeEach(() => {
    for (const s of ['home-screen', 'practice-screen', 'shop-screen']) quenViTri(s);
    window.scrollY = 0;
});

describe('nhớ vị trí theo TỪNG màn', () => {
    test('lưu rồi đọc lại đúng số', () => {
        window.scrollY = 840;
        luuViTri('home-screen');
        expect(docViTri('home-screen')).toBe(840);
    });

    test('mỗi màn giữ vị trí RIÊNG', () => {
        // Dùng chung một biến là khôi phục nhầm vị trí của màn khác — trang chủ
        // dài hơn cửa hàng nhiều.
        window.scrollY = 900;
        luuViTri('home-screen');
        window.scrollY = 120;
        luuViTri('shop-screen');

        expect(docViTri('home-screen')).toBe(900);
        expect(docViTri('shop-screen')).toBe(120);
    });

    test('màn chưa từng ghé → 0, không phải undefined', () => {
        // `undefined` truyền vào `scrollTo({ top })` là NaN, trang không cuộn.
        expect(docViTri('chua-tung-vao')).toBe(0);
    });

    test('quên vị trí → lần sau bắt đầu từ đầu trang', () => {
        window.scrollY = 500;
        luuViTri('home-screen');
        quenViTri('home-screen');
        expect(docViTri('home-screen')).toBe(0);
    });

    test('bỏ qua screenId rỗng, không tạo khoá rác', () => {
        window.scrollY = 300;
        luuViTri('');
        luuViTri(null);
        expect(docViTri('')).toBe(0);
    });
});

describe('khôi phục cuộn', () => {
    test('đợi HAI khung hình rồi mới cuộn', async () => {
        // Khung đầu React mới gắn class `active`; chiều cao trang vẫn là của màn
        // cũ nên `scrollTo` bị kẹp về đáy cũ. Khung hai trang mới đủ cao.
        const scrollTo = vi.fn();
        window.scrollTo = scrollTo;
        const rafs = [];
        window.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };

        khoiPhucCuon(640);
        expect(scrollTo).not.toHaveBeenCalled();

        rafs.shift()();                       // khung 1
        expect(scrollTo).not.toHaveBeenCalled();

        rafs.shift()();                       // khung 2
        expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' });
    });

    test('cuộn TỨC THÌ, không mượt', () => {
        // Đây là KHÔI PHỤC chỗ cũ. Cuộn mượt từ đầu xuống giữa trang trông như
        // trang tự trôi.
        const src = readFileSync(join(__dirname, 'screenScroll.js'), 'utf8');
        expect(src).toMatch(/behavior: 'auto'/);
        expect(src).not.toMatch(/behavior: 'smooth'/);
    });

    test('giá trị hỏng → cuộn về 0, không NaN', () => {
        const scrollTo = vi.fn();
        window.scrollTo = scrollTo;
        window.requestAnimationFrame = (cb) => { cb(); return 1; };
        khoiPhucCuon(undefined);
        expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });
});

describe('nối vào điều hướng', () => {
    test('lưu vị trí màn CŨ trước khi đổi', () => {
        expect(ctx).toMatch(/if \(truoc && truoc !== screenId\) luuViTri\(truoc\)/);
    });

    test('đọc vị trí trong hàm cập nhật state, không qua deps', () => {
        // Thêm `currentScreen` vào deps của `showScreen` là mọi chỗ giữ tham
        // chiếu tới nó (`window._reactShowScreen`) trỏ vào bản cũ.
        const i = ctx.indexOf('const doiMan');
        const body = ctx.slice(i, ctx.indexOf('}, []);', i));
        expect(body).toMatch(/setCurrentScreen\(\(truoc\) =>/);
    });

    test('scrollTop: true thì QUÊN vị trí đã nhớ', () => {
        // Không quên thì lần vào sau lại nhảy về chỗ cũ, dù vừa bảo về đầu trang.
        expect(ctx).toMatch(/if \(scrollTop\) quenViTri\(screenId\)/);
    });

    test('CẢ nhánh thoát bài thi TOEIC cũng qua doiMan', () => {
        // Nhánh đó trước đây gọi thẳng `setCurrentScreen` nên bỏ qua cả việc
        // đóng menu lẫn khôi phục cuộn.
        expect(ctx).toMatch(/toeicConfirm\(\(\) => doiMan\(screenId, opts\)\)/);
    });
});

describe('nút Trang chủ / avatar', () => {
    test('cả hai dùng CHUNG một handler', () => {
        const n = (nav.match(/onClick=\{handleHomeClick\}/g) || []).length;
        expect(n).toBe(2);
    });

    test('ĐANG ở trang chủ → cuộn lên đầu ngay cú bấm ĐẦU', () => {
        // Đã ở trang chủ thì nút này không còn nghĩa "điều hướng"; thứ duy nhất
        // nó có thể làm là đưa lên đầu trang. Bắt bấm hai lần là thêm một bước
        // cho việc chỉ có một nghĩa.
        expect(nav).toMatch(/scrollTop: currentScreen === 'home-screen'/);
    });

    test('KHÔNG còn cơ chế đo bấm kép', () => {
        // Bỏ chú thích trước khi khớp, tránh trúng comment thay vì mã.
        const code = nav.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(code).not.toMatch(/onDoubleClick/);
        expect(code).not.toMatch(/lanBamTruocRef/);
    });

    test('ở màn KHÁC thì giữ chỗ đã cuộn, không nhảy lên đầu', () => {
        // `scrollTop` là biểu thức so sánh, nên ở màn khác nó là `false` →
        // `doiMan` khôi phục vị trí đã lưu.
        const i = nav.indexOf('const handleHomeClick');
        const body = nav.slice(i, nav.indexOf('}, [', i));
        expect(body).not.toMatch(/scrollTop: true/);
    });
});

