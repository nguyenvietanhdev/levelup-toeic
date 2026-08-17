/**
 * Ô tìm và nút ghi âm trên khổ điện thoại.
 *
 * Bố cục hiện tại:
 *   · Ô TÌM   — dòng ngang CỐ ĐỊNH ngay dưới thanh trạng thái, luôn hiện,
 *               chạm vào là gõ được ngay.
 *   · NÚT MIC — ở giữa nav (đáy màn), NHẤN GIỮ để nói; nói xong vào thẳng
 *               popup dịch, chạm nhanh thì chỉ điền chữ vào ô tìm.
 *
 * Đường đi tới đây, và vì sao bỏ từng bước:
 *   1. Ô tìm thu thành nút kính lúp trong nav, chạm để bung → nav vốn đã chật
 *      phải gánh thêm; ô bung ra nằm sát bàn phím nên gõ xong không thấy gợi ý;
 *      và phải BẤM mới gõ được.
 *   2. Gộp kính lúp + mic làm một, chạm đúp để ghi âm → chạm đúp KHÔNG NHÌN
 *      THẤY ĐƯỢC, người dùng phải đoán là có cử chỉ đó.
 *   3. Công tắc hai chế độ (chạm đổi, giữ làm việc) → khi ô tìm luôn sẵn ở dòng
 *      riêng thì không còn gì để chuyển qua lại.
 *
 * Bốn chỗ dễ hỏng:
 *   1. Ô tìm vẫn phải là <input> thật — trên iOS gọi `focus()` ngoài cử chỉ
 *      chạm trực tiếp thì BÀN PHÍM KHÔNG MỞ.
 *   2. Gắn cử chỉ giữ lên chính ô tìm → giữ lâu trên chữ là để bôi đen, cướp
 *      mất là không sửa được chữ. Cử chỉ giữ phải ở nút mic riêng.
 *   3. Không có dấu hiệu đang ghi → giữ tay mà chẳng thấy gì đổi, không biết
 *      máy đã nghe chưa.
 *   4. `handleMicDown` bật cờ tự-dịch mà `handleMicClick` quên tắt → chạm
 *      nhanh cũng bị kéo vào popup dịch, trong khi ý người dùng là điền chữ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'TopNav.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', 'assets', 'styles', 'responsive.css'), 'utf8');

describe('ô tìm giữ nguyên là <input> thật', () => {
    test('không đổi thành <button>', () => {
        // iOS: `focus()` ngoài cử chỉ chạm trực tiếp thì bàn phím không mở.
        expect(src).toMatch(/<input\s[\s\S]*?id="search-input"/);
        expect(src).not.toMatch(/id="search-toggle-btn"/);
    });

    test('KHÔNG gắn cử chỉ giữ lên ô tìm', () => {
        // Ô tìm giờ luôn hiện, chạm vào là để GÕ. Giữ lâu trên chữ là để bôi
        // đen — cướp mất là không sửa được chữ.
        expect(src).not.toMatch(/handleSearchPointerDown/);
        expect(src).not.toMatch(/handleSearchPointerUp/);
    });

    test('bỏ hẳn cơ chế thu/bung và chạm đúp', () => {
        // Để lại là mã chết, và là bẫy cho lần đọc sau.
        expect(src).not.toMatch(/searchExpanded/);
        expect(src).not.toMatch(/DOUBLE_TAP_MS/);
        expect(src).not.toMatch(/micMode/);
    });
});

describe('nút mic: GIỮ để nói, CHẠM để điền', () => {
    const downBody = (() => {
        const i = src.indexOf('const handleMicDown');
        expect(i).toBeGreaterThan(-1);
        return src.slice(i, src.indexOf('const handleMicUp', i));
    })();

    const clickBody = (() => {
        const i = src.indexOf('const handleMicClick');
        expect(i).toBeGreaterThan(-1);
        return src.slice(i, i + 600);
    })();

    test('GIỮ bật cờ tự mở popup dịch', () => {
        // Giữ để nói là muốn TRA NGHĨA ngay, không phải điền chữ vào ô rồi còn
        // phải bấm thêm một lần nữa.
        expect(downBody).toMatch(/autoTranslateRef\.current = true/);
    });

    test('CHẠM NHANH thì TẮT cờ đó', () => {
        // Mọi cú chạm đều đi qua `pointerdown` nên cờ đã bật; không tắt lại ở
        // đây thì chạm nhanh cũng bị kéo vào popup dịch, trong khi ý người dùng
        // là điền chữ vào ô tìm.
        expect(clickBody).toMatch(/autoTranslateRef\.current = false/);
    });

    test('nối đủ 4 sự kiện pointer', () => {
        // Kéo ngón ra ngoài nút rồi nhả: `pointerup` bắn ở chỗ khác — thiếu
        // `onPointerLeave` là micro chạy mãi.
        const i = src.indexOf('className={`mic-btn');
        const block = src.slice(i, i + 1200);
        for (const ev of ['onPointerDown', 'onPointerUp', 'onPointerLeave', 'onPointerCancel']) {
            expect(block, `thiếu ${ev}`).toMatch(new RegExp(ev));
        }
    });

    test('không nhận cú giữ mới khi đang thu', () => {
        expect(downBody).toMatch(/if \(speechRef\.current\?\.isListening\(\)\) return;/);
    });
});

describe('có dấu hiệu đang ghi âm', () => {
    test('gắn class khi đang thu', () => {
        expect(src).toMatch(/is-recording/);
    });

    test('CSS nhấp nháy icon, dùng chung cho cả ba biến thể', () => {
        // Icon đổi hình theo trạng thái nên quy tắc phải phủ cả ba, không thì
        // đổi icon một cái là dấu hiệu biến mất.
        for (const rule of [
            /\.search-bar\.is-recording > \.fa-search/,
            /\.search-bar\.is-recording > \.fa-microphone/,
            /\.search-bar\.is-recording > \.fa-microphone-lines/,
        ]) {
            expect(css, `thiếu quy tắc ${rule}`).toMatch(rule);
        }
        expect(css).toMatch(/animation:\s*micPulse/);
    });
});

/**
 * Bàn phím ảo che mất nav — và nút mic nằm TRONG nav.
 *
 * Nav là `fixed; bottom: 0` nên bám đáy CỬA SỔ, mà bàn phím ảo KHÔNG làm cửa
 * sổ ngắn lại: nó phủ lên trên. `window.innerHeight` không phát hiện được —
 * phải dùng VisualViewport.
 */
describe('nav bám trên bàn phím ảo', () => {
    const hook = readFileSync(join(__dirname, 'useKeyboardInset.js'), 'utf8');

    test('dùng VisualViewport, không phải innerHeight một mình', () => {
        expect(hook).toMatch(/window\.visualViewport/);
        expect(hook).toMatch(/vv\.height/);
    });

    test('trừ cả offsetTop', () => {
        // Người dùng phóng to rồi kéo thì khung nhìn trượt xuống; thiếu vế này
        // là tính dư và nav bị đẩy lơ lửng giữa màn hình.
        expect(hook).toMatch(/vv\.height \+ vv\.offsetTop/);
    });

    test('chặn giá trị âm', () => {
        // Thanh địa chỉ co giãn làm phép trừ ra số âm nhỏ → nav tụt xuống đáy.
        expect(hook).toMatch(/Math\.max\(0,/);
    });

    test('có ngưỡng phân biệt bàn phím với thanh địa chỉ', () => {
        // Thanh địa chỉ chỉ ~50px; không có ngưỡng thì nav nhấp nhô mỗi lần cuộn.
        expect(hook).toMatch(/px > \d+/);
    });

    test('dọn listener VÀ trả --kb về 0 khi tháo', () => {
        const i = hook.indexOf('return () =>');
        const body = hook.slice(i);
        expect(body).toMatch(/removeEventListener\('resize'/);
        expect(body).toMatch(/removeEventListener\('scroll'/);
        expect(body).toMatch(/setProperty\('--kb', '0px'\)/);
    });

    test('không có VisualViewport thì thoát êm', () => {
        expect(hook).toMatch(/if \(!vv\) return;/);
    });

    test('CSS đọc --kb với mặc định 0px', () => {
        expect(css).toMatch(/bottom:\s*var\(--kb,\s*0px\)/);
    });
});

/**
 * Ô tìm bám ngay dưới thanh trạng thái — mà thanh đó cao 1 hay 2 dòng tuỳ nội
 * dung (`flex-wrap`), nên không ghim số cứng được.
 */
describe('đo chiều cao thanh trạng thái', () => {
    const hook = readFileSync(join(__dirname, 'useStatusBarHeight.js'), 'utf8');

    test('dùng ResizeObserver, không đo một lần rồi thôi', () => {
        // Thanh đổi chiều cao khi mua đồ, lên cấp, chọn Part, xoay màn.
        expect(hook).toMatch(/new ResizeObserver/);
        expect(hook).toMatch(/ro\.observe\(el\)/);
    });

    test('không có thanh thì --sb = 0', () => {
        // Màn nào không có thanh trạng thái thì ô tìm bám sát đỉnh.
        expect(hook).toMatch(/if \(!el\)/);
    });

    test('dọn observer VÀ trả --sb về 0 khi tháo', () => {
        const i = hook.indexOf('return () =>');
        const body = hook.slice(i);
        expect(body).toMatch(/ro\.disconnect\(\)/);
        expect(body).toMatch(/setProperty\('--sb', '0px'\)/);
    });

    test('TopNav có gọi cả hai hook', () => {
        expect(src).toMatch(/useKeyboardInset\(\)/);
        expect(src).toMatch(/useStatusBarHeight\(\)/);
    });
});
