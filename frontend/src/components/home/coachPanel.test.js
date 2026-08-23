/**
 * Khối gợi ý luyện tập trên trang chủ.
 *
 * Chỗ dễ hỏng nhất KHÔNG phải hiển thị mà là hai thứ:
 *   1. Bấm gợi ý gọi thẳng `PracticeManager.start` → bỏ qua mọi phép kiểm
 *      (khách chưa đăng nhập, khoá Level, chế độ cuối tuần, bước chọn đề).
 *   2. API lỗi làm vỡ trang chủ — đây là thông tin phụ trợ, không được chặn
 *      người dùng vào luyện tập.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(__dirname, 'CoachPanel.jsx'), 'utf8');
const home = readFileSync(join(__dirname, 'HomeScreen.jsx'), 'utf8');
const api = readFileSync(join(__dirname, '..', '..', 'api', 'coach.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('không làm vỡ trang chủ', () => {
    test('API lỗi trả mảng RỖNG, không ném', () => {
        // Gợi ý hỏng mà chặn luôn việc vào luyện tập là đánh đổi tệ nhất.
        expect(api).toMatch(/catch \{\s*return \[\];\s*\}/);
    });

    test('không có gợi ý thì ẩn HẲN, không hiện khung rỗng', () => {
        // Một ô trống nhấp nháy trên đầu trang chủ mỗi lần vào thì phiền hơn là
        // hữu ích.
        expect(panel).toMatch(/if \(!items\?\.length\) return null;/);
    });

    test('huỷ cập nhật state khi component đã rời màn', () => {
        // Vào rồi thoát nhanh hơn mạng thì `setState` chạy trên component đã gỡ.
        expect(panel).toMatch(/let huy = false/);
        expect(panel).toMatch(/return \(\) => \{ huy = true; \};/);
    });
});

describe('bấm gợi ý đi đúng đường', () => {
    test('chế độ đi qua `handleModeClick`, KHÔNG gọi thẳng PracticeManager', () => {
        // `handleModeClick` mới có đủ phép kiểm: khách chưa đăng nhập, khoá
        // Level, chế độ cuối tuần, và bước chọn đề.
        const i = home.indexOf('const handleCoachPick');
        const than = home.slice(i, home.indexOf('};', i));
        expect(than).toMatch(/handleModeClick\(g\.mode\)/);
        expect(than).not.toMatch(/PracticeManager\.start/);
    });

    test('màn hình riêng đi qua `showScreen`', () => {
        const i = home.indexOf('const handleCoachPick');
        const than = home.slice(i, home.indexOf('};', i));
        expect(than).toMatch(/showScreen\(g\.screen\)/);
    });

    test('khai báo SAU `handleModeClick` — không dùng trước khi có', () => {
        expect(home.indexOf('const handleModeClick'))
            .toBeLessThan(home.indexOf('const handleCoachPick'));
    });
});

describe('trình bày', () => {
    test('mỗi gợi ý hiện LÝ DO, không chỉ mệnh lệnh', () => {
        // "Luyện Tốc độ đi" thì người ta bỏ qua; "bạn đúng 28%, thấp nhất" thì
        // họ hiểu vì sao.
        expect(panel).toMatch(/\{g\.lyDo\}/);
    });

    test('mặc định chỉ hiện MỘT gợi ý', () => {
        // Đổ cả năm mục lên đầu trang chủ thì nó thành bức tường chữ che mất
        // lưới chế độ — mà lưới mới là thứ người dùng vào đây để bấm.
        expect(panel).toMatch(/items\.slice\(0, 1\)/);
    });

    test('nút mở rộng chỉ hiện khi CÓ thêm để xem', () => {
        expect(panel).toMatch(/items\.length > 1 &&/);
    });

    test('đặt TRÊN lưới chế độ', () => {
        expect(home.indexOf('<CoachPanel'))
            .toBeLessThan(home.indexOf('game-modes-grid'));
    });

    test('CSS mỗi selector khai đúng một lần', () => {
        for (const sel of ['.coach-panel {', '.coach-item {', '.coach-body {']) {
            expect(css.split(sel).length - 1).toBe(1);
        }
    });

    test('lý do dài không đẩy mũi tên tràn ra ngoài', () => {
        const i = css.indexOf('.coach-body {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/min-width: 0/);
    });
});
