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

describe('bấm hai lần → lên đầu trang', () => {
    test('avatar và nút Trang chủ dùng CHUNG một handler', () => {
        const n = (nav.match(/onClick=\{handleHomeClick\}/g) || []).length;
        expect(n).toBe(2);
    });

    test('tự đo khoảng cách, KHÔNG dùng onDoubleClick', () => {
        // `onDoubleClick` trễ thêm ~300ms cho MỌI cú bấm đơn.
        // Bỏ chú thích trước khi khớp: chữ `onDoubleClick` có trong doc-block
        // giải thích vì sao KHÔNG dùng nó — khớp thẳng là trúng comment của
        // chính mình chứ không phải mã.
        const code = nav.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(code).not.toMatch(/onDoubleClick/);
        expect(code).toMatch(/Date\.now\(\)/);
    });

    test('chỉ tính bấm kép khi ĐANG ở trang chủ', () => {
        // Đang luyện tập thì cú đầu mới mở hộp "Thoát luyện tập?" chứ chưa đi
        // đâu — tính cú thứ hai là bấm kép sẽ xoá vị trí cần giữ.
        expect(nav).toMatch(/const dangOTrangChu = currentScreen === 'home-screen'/);
        expect(nav).toMatch(/bamKep = dangOTrangChu &&/);
    });

    test('có nói cho người dùng biết mẹo này', () => {
        // Tính năng ẩn mà không ai biết thì bằng không tồn tại.
        expect(nav).toMatch(/bấm hai lần để lên đầu trang/);
    });
});
