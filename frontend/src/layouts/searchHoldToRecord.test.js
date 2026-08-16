/**
 * Nút kính lúp trên nav điện thoại: CHẠM mở ô tìm, GIỮ thì ghi âm.
 *
 * Trước đây đó là hai đích chạm nằm cạnh nhau (kính lúp + mic) trên một hàng
 * nav vốn đã chật. Gộp lại còn một chỗ, hai ý định.
 *
 * Bốn chỗ dễ hỏng:
 *   1. Đổi input thu-lại thành <button> cho gọn → trên iOS gọi `focus()` ngoài
 *      cử chỉ chạm trực tiếp thì BÀN PHÍM KHÔNG MỞ. Phải giữ nguyên là input.
 *   2. Không chặn `pointerup` sau cử chỉ giữ → ô bung ra và bàn phím bật lên
 *      ngay khi người dùng vừa nói xong.
 *   3. Bắt cả khi ô ĐÃ BUNG → giữ lâu trên chữ để bôi đen bị cướp mất.
 *   4. Không có dấu hiệu đang ghi → giữ tay mà chẳng thấy gì đổi, không biết
 *      máy đã nghe chưa (đúng vấn đề đã sửa cho popup Dịch nhanh).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'TopNav.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', 'assets', 'styles', 'responsive.css'), 'utf8');

describe('giữ nguyên input, không đổi thành button', () => {
    test('ô tìm vẫn là <input>', () => {
        // iOS: `focus()` ngoài cử chỉ chạm trực tiếp thì bàn phím không mở.
        expect(src).toMatch(/<input\s[\s\S]*?id="search-input"/);
    });

    test('không có <button> giả thay ô tìm', () => {
        expect(src).not.toMatch(/id="search-toggle-btn"/);
    });
});

describe('cử chỉ giữ trên ô tìm', () => {
    test('nối đủ 4 sự kiện pointer', () => {
        for (const ev of ['onPointerDown', 'onPointerUp', 'onPointerLeave', 'onPointerCancel']) {
            const i = src.indexOf('id="search-input"');
            const block = src.slice(i, i + 2200);
            expect(block, `thiếu ${ev}`).toMatch(new RegExp(`${ev}=\\{handleSearch`));
        }
    });

    test('kéo ngón ra ngoài rồi nhả vẫn dừng micro', () => {
        // `pointerup` bắn ở chỗ khác — thiếu `onPointerLeave` là micro chạy mãi.
        expect(src).toMatch(/onPointerLeave=\{handleSearchPointerUp\}/);
    });

    test('dùng lại createHoldGesture, không tự đếm giờ', () => {
        expect(src).toMatch(/searchHoldRef\.current = createHoldGesture\(\{/);
        expect(src).toMatch(/thresholdMs: 350/);
    });
});

describe('chỉ bắt khi ô đang THU', () => {
    test('bỏ qua khi ô đã bung (đang gõ)', () => {
        // Giữ lâu trên chữ là để bôi đen — cướp mất là không sửa được.
        expect(src).toMatch(/if \(isInPractice \|\| searchFocused\) return;/);
    });

    test('không hỗ trợ giọng nói thì để chạm mở ô như cũ', () => {
        expect(src).toMatch(/if \(!speechSupported\) return;\s*\/\/ không hỗ trợ/);
    });
});

describe('giữ xong KHÔNG bung ô ra', () => {
    test('chặn hành vi mặc định sau cử chỉ giữ', () => {
        // Không chặn thì `pointerup` kéo theo focus → bàn phím bật lên ngay khi
        // người dùng vừa nói xong.
        expect(src).toMatch(/const wasHeld = searchHoldRef\.current\.isActive\(\)/);
        expect(src).toMatch(/if \(wasHeld\) e\.preventDefault\(\)/);
    });

    test('bỏ tiêu điểm khi bắt đầu ghi', () => {
        // Bàn phím ảo che mất nửa màn hình trong lúc đang nói.
        expect(src).toMatch(/document\.getElementById\('search-input'\)\?\.blur\(\)/);
    });
});

describe('có dấu hiệu đang ghi âm', () => {
    test('gắn class khi ghi mà ô còn thu', () => {
        expect(src).toMatch(/speechOn && !searchFocused \? ' is-recording' : ''/);
    });

    test('CSS tô đỏ + nhấp nháy chính nút kính lúp', () => {
        const r = css.match(/\.top-nav:not\(\.search-active\) \.search-bar\.is-recording > \.fa-search\s*\{([^}]*)\}/);
        expect(r, 'thiếu quy tắc báo đang ghi').toBeTruthy();
        expect(r[1]).toMatch(/animation:\s*micPulse/);
        expect(r[1]).toMatch(/background:\s*var\(--primary-color\)/);
    });

    test('micPulse có thật', () => {
        const layout = readFileSync(
            join(__dirname, '..', 'assets', 'styles', 'layout.css'), 'utf8');
        expect(layout).toMatch(/@keyframes micPulse/);
    });
});

describe('nút mic riêng biến mất khi ô thu', () => {
    test('vẫn display:none ở khổ điện thoại', () => {
        // Gộp vào nút kính lúp rồi thì để lại là hai đích chạm cho một việc.
        // Khớp bằng regex, không phải chuỗi cứng — thụt lề thay đổi là test đỏ
        // oan trong khi CSS vẫn đúng.
        expect(css).toMatch(/\.mic-btn\s*\{\s*display:\s*none;\s*\}/);
    });
});

/**
 * HAI nút trong ô tìm: xoá chữ · đóng ô.
 *
 * Trước đây gộp làm một — bấm × là ô đóng luôn, gõ nhầm một chữ phải mở lại từ
 * đầu. Trên iOS còn tệ hơn: mất tiêu điểm là bàn phím sập xuống, phải chạm thêm
 * lần nữa mới gõ tiếp được.
 *
 * Ba chỗ dễ hỏng:
 *   1. Hai nút cùng class `.clear-search-btn` mà class đó ghim `right: 8px` →
 *      chồng khít lên nhau.
 *   2. Không nới lề phải của input → chữ gõ tới nơi chui xuống dưới icon.
 *   3. Nút ĐÓNG bị gỡ khỏi DOM khi bấm → `click` bắn xuyên xuống thẻ bên dưới.
 *      Nút XOÁ thì không (ô vẫn mở), nên không cần chống xuyên thấu.
 */
describe('hai nút: xoá chữ và đóng ô', () => {
    const layout = readFileSync(
        join(__dirname, '..', 'assets', 'styles', 'layout.css'), 'utf8');

    test('nút XOÁ chỉ hiện khi có chữ', () => {
        // Ô rỗng thì nút xoá vô nghĩa.
        expect(src).toMatch(/\{searchQuery && !isInPractice && \(/);
        expect(src).toMatch(/id="clear-search-btn"/);
    });

    test('nút ĐÓNG hiện cả khi ô rỗng', () => {
        // Đó mới là lối thoát: chạm mở ô rồi đổi ý thì phải có chỗ bấm.
        expect(src).toMatch(/\{\(searchQuery \|\| searchFocused\) && !isInPractice && \(/);
        expect(src).toMatch(/id="close-search-btn"/);
    });

    test('xoá chữ thì GIỮ ô mở và giữ tiêu điểm', () => {
        const i = src.indexOf('const clearSearchText = useCallback');
        const body = src.slice(i, i + 400);
        expect(body).toMatch(/setSearchQuery\(''\)/);
        // Điểm khác biệt với `closeSearch`: focus thay vì blur.
        expect(body).toMatch(/\.focus\(\)/);
        expect(body).not.toMatch(/\.blur\(\)/);
    });

    test('đóng ô thì blur — `.search-active` gắn theo focus', () => {
        const i = src.indexOf('const closeSearch = useCallback');
        expect(src.slice(i, i + 300)).toMatch(/\.blur\(\)/);
    });

    test('chỉ nút ĐÓNG cần chống bấm xuyên thấu', () => {
        // Nút xoá không bị gỡ khỏi DOM lúc bấm (ô vẫn mở) nên không cần.
        const close = src.slice(src.indexOf('id="close-search-btn"'), src.indexOf('id="close-search-btn"') + 600);
        const clear = src.slice(src.indexOf('id="clear-search-btn"'), src.indexOf('id="clear-search-btn"') + 600);
        expect(close).toMatch(/swallowNextClick\(\)/);
        expect(clear).not.toMatch(/swallowNextClick\(\)/);
    });

    test('hai nút KHÔNG chồng lên nhau', () => {
        // Cùng class nên cùng `right: 8px` — phải đẩy một cái vào trong.
        expect(layout).toMatch(/\.close-search-btn\s*\{[^}]*right:\s*8px/);
        expect(layout).toMatch(/\.clear-search-btn:not\(\.close-search-btn\)\s*\{[^}]*right:\s*30px/);
    });

    test('chữ không chui xuống dưới hai nút', () => {
        expect(layout).toMatch(/\.search-bar:has\(\.close-search-btn\) input\s*\{[^}]*padding-right/);
        // Bản mobile cũng phải nới, trước là 40px cho MỘT nút.
        expect(css).toMatch(/padding:\s*8px 62px 8px 35px/);
    });

    test('mỗi nút có nhãn riêng cho trình đọc màn hình', () => {
        expect(src).toMatch(/aria-label="Xoá nội dung"/);
        expect(src).toMatch(/aria-label="Đóng ô tìm"/);
    });
});
