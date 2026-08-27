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

describe('hướng dẫn bằng thị giác trên lưới thẻ', () => {
    const css = readFileSync(
        join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
    const api = readFileSync(join(__dirname, '..', '..', 'api', 'coach.js'), 'utf8');

    test('CHỈ MỘT thẻ nhấp nháy mỗi lần', () => {
        // Nhiều thẻ cùng nháy thì không còn là hướng dẫn, chỉ là nhiễu — và
        // người dùng học cách phớt lờ nó.
        expect(home).toMatch(/plan\.next === m\.mode.*'is-next'/);
    });

    test('cả vòng đang tập trung sáng NHẸ, không nháy', () => {
        expect(home).toMatch(/plan\.vong\?\.modes\?\.includes\(m\.mode\).*'is-focus'/);
        // `is-focus` không có animation, và bị `is-next` ghi đè khi trùng.
        expect(css).toMatch(/\.game-mode-card\.is-focus:not\(\.is-next\)/);
    });

    test('thẻ bị KHOÁ không nháy', () => {
        // Nháy một thẻ bấm vào là báo lỗi thì tệ hơn không nháy gì.
        expect(home).toMatch(/!locked && plan\.next === m\.mode/);
        expect(home).toMatch(/!locked && plan\.vong\?\.modes/);
    });

    test('tôn trọng `prefers-reduced-motion`', () => {
        // Chuyển động lặp vô hạn gây khó chịu thật với một số người. Nhưng bỏ
        // luôn cả dấu hiệu thì họ mất hướng dẫn — nên giữ viền, chỉ bỏ nháy.
        //
        // Soi khối media CHỨA `.is-next`, không phải khối đầu tiên trong file:
        // file có nhiều `prefers-reduced-motion` khác nhau, và bắt nhầm khối thì
        // xoá khối này đi test vẫn xanh.
        // Neo vào LẦN XUẤT HIỆN của `.game-mode-card.is-next` nằm TRONG một
        // khối media — file có nhiều `prefers-reduced-motion` khác nhau, bắt
        // khối đầu tiên thì xoá khối này đi test vẫn xanh.
        const khop = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
            .map((m) => m[1])
            .filter((than) => than.includes('.game-mode-card.is-next'));

        expect(khop).toHaveLength(1);
        expect(khop[0]).toMatch(/animation: none/);
        // Giữ box-shadow: bỏ luôn cả dấu hiệu thì họ mất hướng dẫn.
        expect(khop[0]).toMatch(/box-shadow/);
    });

    test('viền thẻ nên chơi phải ĐẬM, không mờ', () => {
        // Viền mờ thì thẻ lẫn vào 15 thẻ khác và mất tác dụng hướng dẫn.
        const i = css.indexOf('.game-mode-card.is-next {');
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/border: 2px solid var\(--accent-color\)/);
    });

    test('vòng đang tập trung sáng NHẠT HƠN thẻ nên chơi', () => {
        // Cả năm thẻ cùng đậm thì không còn chỉ được vào đâu.
        const i = css.indexOf('.game-mode-card.is-focus:not(.is-next)');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/rgba\(139, 92, 246, 0\.\d+\)/);
    });

    test('API hỏng thì lưới vẫn hiện bình thường', () => {
        // Đây là thứ TĂNG THÊM; hỏng mà chặn việc luyện tập là đánh đổi tệ nhất.
        const i = api.indexOf('async plan()');
        const than = api.slice(i, api.indexOf('\n    },', i));
        expect(than).toMatch(/catch \{/);
        expect(than).toMatch(/next: null/);
    });

    test('lộ trình tính ở SERVER, client không tự suy', () => {
        // Client tự suy thì phải lặp lại toàn bộ luật (vòng nào, ngưỡng bao
        // nhiêu) và hai bản sao sẽ lệch — gợi ý nói một đằng, thẻ sáng một nẻo.
        expect(home).not.toMatch(/LO_TRINH|vongNenTapTrung/);
        expect(home).toMatch(/CoachAPI\.plan\(\)/);
    });

    test('huỷ cập nhật khi rời màn', () => {
        const i = home.indexOf('CoachAPI.plan()');
        const truoc = home.slice(Math.max(0, i - 200), i);
        expect(truoc).toMatch(/let huy = false/);
    });
});

describe('thẻ được chỉ định KHÔNG đổi khi F5', () => {
    test('client KHÔNG tự chọn — chỉ đọc `next` từ server', () => {
        // Client tự chọn thì mỗi lần mở trang là một kết quả khác. Chốt nằm ở
        // server và được LƯU, nên F5 bao nhiêu lần cũng ra đúng một thẻ.
        expect(home).not.toMatch(/Math\.random|shuffle|sort\(\)/);
        expect(home).toMatch(/plan\.next === m\.mode/);
    });

    test('không lưu lựa chọn ở localStorage', () => {
        // localStorage chỉ là backup khi server chết; để nó quyết thì hai
        // thiết bị của cùng một người sẽ được giao hai nhiệm vụ khác nhau.
        const i = home.indexOf('CoachAPI.plan()');
        expect(home.slice(Math.max(0, i - 300), i + 300)).not.toMatch(/localStorage/);
    });

    test('có nhãn chữ, không bắt đoán ý màu sắc', () => {
        // Viền nháy nói "thẻ này khác" nhưng không nói phải làm gì.
        expect(home).toMatch(/mode-next-badge/);
        expect(home).toMatch(/Luyện cái này/);
    });

    test('nhãn chỉ hiện trên thẻ được chỉ định và KHÔNG bị khoá', () => {
        const i = home.indexOf('mode-next-badge');
        const truoc = home.slice(Math.max(0, i - 200), i);
        expect(truoc).toMatch(/!locked && plan\.next === m\.mode/);
    });

    test('nhãn mời khác màu nhãn khoá', () => {
        // Nhãn khoá (hổ phách) là thứ CHẶN; nhãn này là thứ MỜI. Cùng màu thì
        // người dùng đọc lướt sẽ tưởng thẻ đang bị khoá.
        const i = css.indexOf('.mode-next-badge {');
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/139,92,246/);
        expect(rule).not.toMatch(/245,158,11/);
    });
});
