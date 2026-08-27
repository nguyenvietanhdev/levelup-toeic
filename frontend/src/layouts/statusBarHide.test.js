/**
 * Thanh trạng thái: ẩn khi luyện tập, hiện ở trang chủ.
 *
 * Có HAI kiểu ẩn và chúng phải khác nhau:
 *   ẩn theo cuộn  → trượt đi nhưng GIỮ chỗ (lăn ngược là về ngay)
 *   ẩn khi luyện  → bỏ HẲN khỏi luồng (không về cho tới khi rời màn)
 *
 * Phần đầu chạy THẬT luật cuộn — test đọc chữ không bắt được lỗi luồng.
 */
import { describe, test, expect } from 'vitest';

/** Bản sao rút gọn đúng luật trong `useHideOnScrollDown`. */
function taoMay({ nguong = 80, toiThieu = 6 } = {}) {
    let truoc = 0;
    let an = false;
    return {
        cuonToi(nay) {
            const chenh = nay - truoc;
            if (Math.abs(chenh) < toiThieu) return an;
            if (nay <= nguong) an = false;
            else an = chenh > 0;
            truoc = nay;
            return an;
        },
        get an() { return an; },
    };
}

describe('ẩn khi xuống, hiện khi lên', () => {
    test('cuộn XUỐNG qua ngưỡng thì ẩn', () => {
        const m = taoMay();
        expect(m.cuonToi(300)).toBe(true);
    });

    test('cuộn LÊN thì hiện lại ngay', () => {
        const m = taoMay();
        m.cuonToi(300);
        expect(m.cuonToi(200)).toBe(false);
    });

    test('trong ngưỡng thì LUÔN hiện, kể cả khi đang đi xuống', () => {
        // Cuộn đà trên trackpad hay dừng ở vài px đầu; để ẩn ở đó thì header
        // biến mất mà không có cách gọi về ngoài việc cuộn xuống rồi lên lại.
        const m = taoMay();
        expect(m.cuonToi(50)).toBe(false);
        expect(m.cuonToi(79)).toBe(false);
    });

    test('rung tay vài px KHÔNG lật trạng thái', () => {
        const m = taoMay();
        m.cuonToi(300);            // ẩn
        expect(m.cuonToi(297)).toBe(true);   // lệch 3px < 6 → giữ nguyên
        expect(m.cuonToi(299)).toBe(true);
    });

    test('cuộn xuống rồi lên nhiều lần vẫn đúng', () => {
        const m = taoMay();
        expect(m.cuonToi(500)).toBe(true);
        expect(m.cuonToi(400)).toBe(false);
        expect(m.cuonToi(600)).toBe(true);
        expect(m.cuonToi(100)).toBe(false);
    });

    test('về đầu trang thì hiện', () => {
        const m = taoMay();
        m.cuonToi(500);
        expect(m.cuonToi(0)).toBe(false);
    });
});

describe('thanh trạng thái ẩn khi vào chế độ luyện tập', () => {
    const { readFileSync } = require('node:fs');
    const { join, dirname } = require('node:path');
    const { fileURLToPath } = require('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const sb = readFileSync(join(__dirname, 'StatusBar.jsx'), 'utf8');

    test('ẩn khi `currentScreen` là màn luyện tập', () => {
        // XP, xu, năng lượng là thông tin NGOÀI buổi học. Giữa lúc làm bài
        // không ai đọc, mà nó cộng với thanh điều hướng và header luyện tập
        // thành ba tầng chồng nhau đẩy câu hỏi xuống dưới mép.
        expect(sb).toMatch(/currentScreen === 'practice-screen'/);
        expect(sb).toMatch(/hidden = anTheoCuon \|\| dangLuyenTap/);
    });

    test('VẪN ẩn/hiện theo cuộn ở các màn khác', () => {
        // Thêm luật mới không được nuốt luật cũ.
        expect(sb).toMatch(/const anTheoCuon = useHideOnScrollDown\(\)/);
    });

    test('KHÔNG ẩn ở màn thi TOEIC', () => {
        // Bài thi chạy BÊN TRONG `toeic-screen` cùng màn chọn đề, nên
        // `currentScreen` không phân biệt được "đang thi" với "đang chọn đề".
        // Bỏ comment trước khi soi: chính comment giải thích cũng nhắc
        // `toeic-screen`, nên soi văn bản thô là báo nhầm.
        const code = sb.replace(/\/\/[^\n]*/g, '');
        expect(code).not.toMatch(/toeic-screen/);
    });

    test('vẫn `inert` khi ẩn — Tab không lọt vào ô vô hình', () => {
        expect(sb).toMatch(/inert=\{hidden\}/);
    });

    test('dùng hook CHUNG, không chép bản riêng', () => {
        // Doc của hook nói rõ: hai bản chép rời sẽ lệch ngưỡng và người dùng
        // thấy các thanh ẩn/hiện so le.
        expect(sb).toMatch(/from '\.\/useHideOnScrollDown\.js'/);
    });
});

describe('hai kiểu ẩn KHÁC nhau', () => {
    const { readFileSync } = require('node:fs');
    const { join, dirname } = require('node:path');
    const { fileURLToPath } = require('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const sb = readFileSync(join(__dirname, 'StatusBar.jsx'), 'utf8');
    const css = readFileSync(join(__dirname, '..', 'assets', 'styles', 'layout.css'), 'utf8');

    test('ẩn theo cuộn GIỮ chỗ — chỉ trượt đi', () => {
        // Lăn ngược một cái là thanh về ngay; bỏ chỗ rồi trả lại làm nội dung
        // nhảy lên nhảy xuống theo từng cú cuộn.
        const i = css.indexOf('.status-bar--hidden {');
        const rule = css.slice(css.indexOf('{', i), css.indexOf('}', i));
        expect(rule).toMatch(/transform: translateY\(-100%\)/);
        expect(rule).not.toMatch(/display: none/);
    });

    test('ẩn khi luyện tập bỏ HẲN khỏi luồng', () => {
        // Đây chính là khoảng trống "khá xa" giữa nav và header luyện tập:
        // giữ chỗ là để thừa một dải 33px suốt buổi học.
        const i = css.indexOf('.status-bar--an-han {');
        expect(i).toBeGreaterThan(-1);
        const rule = css.slice(css.indexOf('{', i), css.indexOf('}', i));
        expect(rule).toMatch(/display: none/);
    });

    test('hai lớp gắn ĐỘC LẬP, không dùng chung một cờ', () => {
        // Gộp thành một thì hoặc cuộn cũng bỏ chỗ (nội dung nhảy), hoặc luyện
        // tập cũng giữ chỗ (còn nguyên dải trống).
        expect(sb).toMatch(/dangLuyenTap \? 'status-bar--an-han' : ''/);
        expect(sb).toMatch(/anTheoCuon \? 'status-bar--hidden' : ''/);
    });
});

describe('header luyện tập KHÔNG còn ẩn theo cuộn', () => {
    const { readFileSync } = require('node:fs');
    const { join, dirname } = require('node:path');
    const { fileURLToPath } = require('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const screen = readFileSync(
        join(__dirname, '..', 'components', 'practice', 'PracticeScreen.jsx'), 'utf8');
    const css = readFileSync(
        join(__dirname, '..', 'assets', 'styles', 'components.css'), 'utf8');

    test('header là khối tĩnh, không sticky', () => {
        // Thanh trạng thái đã ẩn hẳn khi luyện tập nên header lên sát nav rồi —
        // dính thêm chỉ tạo một tầng nữa mà không được gì.
        const cacKhoi = [...css.matchAll(/\.practice-header \{([^}]*)\}/g)].map((m) => m[1]);
        expect(cacKhoi.some((k) => /position: sticky/.test(k))).toBe(false);
    });

    test('không còn lớp `da-an`', () => {
        expect(screen).not.toMatch(/da-an/);
        expect(css).not.toMatch(/practice-header\.da-an/);
    });

    test('không còn biến `--practice-nav-h` mồ côi', () => {
        // Bỏ sticky thì không cần đo chiều cao nav nữa.
        expect(css).not.toMatch(/--practice-nav-h/);
    });
});
